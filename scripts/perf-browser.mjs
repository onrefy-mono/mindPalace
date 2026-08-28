import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { escapeHtml, formatMs, pageShell, statusBadge } from './lib/perf-report-html.mjs';

const root = process.cwd();
const perfDir = path.join(root, '.perf');
const datasetsDir = path.join(perfDir, 'datasets');
const reportsDir = path.join(perfDir, 'reports');
const datasetName = process.env.PERF_DATASET ?? 'medium';
const runCount = Math.max(1, Number(process.env.PERF_RUNS ?? 3));
const port = Number(process.env.PERF_PORT ?? 5174);
const datasetPath = path.join(datasetsDir, `${datasetName}.json`);
const runtimeDataPath = path.join(perfDir, 'runtime-data.json');
const url = `http://127.0.0.1:${port}/?perf=1`;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function runNodeScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

function stopProcessTree(child) {
  if (!child?.pid || child.killed) return Promise.resolve();
  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    killer.on('exit', () => resolve());
    killer.on('error', () => resolve());
  });
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(targetUrl, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const fallbackChannels = ['msedge', 'chrome'];
    for (const channel of fallbackChannels) {
      try {
        return await chromium.launch({ channel, headless: true });
      } catch {
        // Try the next installed browser channel.
      }
    }
    throw new Error(
      `Unable to launch a Playwright browser. Run "npx playwright install chromium" if this machine has no supported browser. Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function byName(measures, name) {
  return measures.filter((entry) => entry.name === name);
}

function stats(measures, name) {
  const values = byName(measures, name)
    .map((entry) => entry.duration)
    .filter((duration) => typeof duration === 'number')
    .sort((a, b) => a - b);
  return numberStats(values);
}

function numberStats(values) {
  const sorted = values
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    avg: sum / sorted.length,
    p50: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
  };
}

function latestDuration(measures, name) {
  return byName(measures, name).at(-1)?.duration ?? null;
}

function summarizeRun(collected, loadDurationMs) {
  const measures = collected.perf?.measures ?? [];
  const counters = collected.perf?.counters ?? {};
  return {
    appInit: latestDuration(measures, 'app:init'),
    storageInit: latestDuration(measures, 'storage:init'),
    storageFetch: latestDuration(measures, 'storage:fetch'),
    layoutSignature: stats(measures, 'graph:layout-signature'),
    buildSimNodes: stats(measures, 'graph:build-sim-nodes'),
    renderFrame: stats(measures, 'graph:render-frame'),
    simulation: latestDuration(measures, 'graph:simulation'),
    simulationTicks: counters['graph:simulation:tick'] ?? 0,
    renderFrameCount: counters['graph:render-frame:count'] ?? 0,
    longTasks: collected.perf?.longTasks?.length ?? 0,
    browserLoadDurationMs: loadDurationMs,
  };
}

function aggregateRuns(runs) {
  const values = (selector) => runs.map(selector).filter((value) => typeof value === 'number');
  return {
    appInit: numberStats(values((run) => run.summary.appInit))?.avg ?? null,
    appInitRuns: numberStats(values((run) => run.summary.appInit)),
    storageInit: numberStats(values((run) => run.summary.storageInit))?.avg ?? null,
    storageFetch: numberStats(values((run) => run.summary.storageFetch))?.avg ?? null,
    layoutSignature: numberStats(values((run) => run.summary.layoutSignature?.avg)),
    buildSimNodes: numberStats(values((run) => run.summary.buildSimNodes?.avg)),
    renderFrame: numberStats(values((run) => run.summary.renderFrame?.p95)),
    simulation: numberStats(values((run) => run.summary.simulation))?.avg ?? null,
    simulationTicks: Math.round(numberStats(values((run) => run.summary.simulationTicks))?.avg ?? 0),
    renderFrameCount: Math.round(numberStats(values((run) => run.summary.renderFrameCount))?.avg ?? 0),
    longTasks: Math.round(numberStats(values((run) => run.summary.longTasks))?.avg ?? 0),
    browserLoadDurationMs: numberStats(values((run) => run.summary.browserLoadDurationMs))?.avg ?? null,
  };
}

async function collectBrowserRun(browser, runIndex) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  try {
    const startedAt = performance.now();
    await page.goto(`${url}&run=${runIndex}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__mindPalacePerf?.marks.some((entry) => entry.name === 'app:ready'),
      null,
      { timeout: 30000 },
    );
    await page.waitForSelector('svg', { timeout: 30000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const loadDurationMs = performance.now() - startedAt;

    await page.mouse.move(720, 480);
    await page.mouse.click(720, 480);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const collected = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0]?.toJSON?.() ?? null;
      const resources = performance.getEntriesByType('resource').map((entry) => entry.toJSON());
      return {
        perf: window.__mindPalacePerf,
        navigation,
        resources,
        memory: performance.memory
          ? {
              jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
              usedJSHeapSize: performance.memory.usedJSHeapSize,
            }
          : null,
        dom: {
          elements: document.querySelectorAll('*').length,
          svgElements: document.querySelectorAll('svg *').length,
        },
      };
    });

    return {
      runIndex,
      summary: summarizeRun(collected, loadDurationMs),
      collected,
    };
  } finally {
    await page.close();
  }
}

function browserBudgets() {
  return {
    appInitMs: datasetName === 'small' ? 500 : datasetName === 'medium' ? 1500 : 5000,
    renderFrameP95Ms: datasetName === 'large' ? 100 : 50,
  };
}

function statusFor(summary, budgets) {
  return {
    appInit: summary.appInit == null || summary.appInit <= budgets.appInitMs ? 'pass' : 'fail',
    renderFrameP95:
      summary.renderFrame?.p95 == null || summary.renderFrame.p95 <= budgets.renderFrameP95Ms ? 'pass' : 'fail',
  };
}

function writeReportFiles(report, latestRun) {
  const summary = report.summary;
  const budgets = report.budgets;
  const budgetStatus = report.budgetStatus;
  const collected = latestRun.collected;
  const metricRows = [
    ['Browser load duration avg', formatMs(summary.browserLoadDurationMs), ''],
    ['App init avg', formatMs(summary.appInit), statusBadge(budgetStatus.appInit)],
    ['Storage init avg', formatMs(summary.storageInit), ''],
    ['Storage fetch avg', formatMs(summary.storageFetch), ''],
    ['Layout signature avg', formatMs(summary.layoutSignature?.avg), ''],
    ['Build sim nodes avg', formatMs(summary.buildSimNodes?.avg), ''],
    ['Render frame p95 avg', formatMs(summary.renderFrame?.avg), statusBadge(budgetStatus.renderFrameP95)],
    ['Simulation avg', `${formatMs(summary.simulation)} / ticks ${summary.simulationTicks}`, ''],
    ['Render frames avg', summary.renderFrameCount, ''],
    ['Long tasks avg', summary.longTasks, ''],
    ['DOM elements', collected.dom.elements, ''],
    ['SVG elements', collected.dom.svgElements, ''],
  ];

  return Promise.all([
    fs.writeFile(path.join(reportsDir, `browser-${datasetName}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    fs.writeFile(
      path.join(reportsDir, `browser-${datasetName}.md`),
      [
        `# Mind Palace Browser Performance (${datasetName})`,
        '',
        `Generated: ${report.generatedAt}`,
        `URL: ${url}`,
        `Runs: ${report.runCount}`,
        '',
        '## Summary',
        '',
        `- Browser load duration avg: ${formatMs(summary.browserLoadDurationMs)}`,
        `- App init avg: ${formatMs(summary.appInit)} (${budgetStatus.appInit})`,
        `- Storage init avg: ${formatMs(summary.storageInit)}`,
        `- Storage fetch avg: ${formatMs(summary.storageFetch)}`,
        `- Layout signature avg: ${formatMs(summary.layoutSignature?.avg)}`,
        `- Build sim nodes avg: ${formatMs(summary.buildSimNodes?.avg)}`,
        `- Render frame p95 avg: ${formatMs(summary.renderFrame?.avg)} (${budgetStatus.renderFrameP95})`,
        `- Simulation avg: ${formatMs(summary.simulation)} / ticks ${summary.simulationTicks}`,
        `- Render frames avg: ${summary.renderFrameCount}`,
        `- Long tasks avg: ${summary.longTasks}`,
        `- DOM elements: ${collected.dom.elements}`,
        `- SVG elements: ${collected.dom.svgElements}`,
        '',
        '## Budgets',
        '',
        `- App init budget: ${budgets.appInitMs} ms`,
        `- Render frame p95 budget: ${budgets.renderFrameP95Ms} ms`,
        '',
      ].join('\n'),
      'utf8',
    ),
    fs.writeFile(
      path.join(reportsDir, `browser-${datasetName}.html`),
      pageShell({
        title: `Mind Palace Browser Performance (${datasetName})`,
        subtitle: `Generated: ${report.generatedAt} · Runs: ${report.runCount}`,
        body: `
          <div class="links">
            <a href="./index.html">报告首页</a>
            <a href="./browser-${escapeHtml(datasetName)}.json">原始 JSON</a>
            <a href="./browser-${escapeHtml(datasetName)}.md">Markdown</a>
          </div>
          <section class="section grid">
            <div class="card"><div class="metric-label">App init avg</div><div class="metric-value">${formatMs(summary.appInit)} ${statusBadge(budgetStatus.appInit)}</div></div>
            <div class="card"><div class="metric-label">Render frame p95 avg</div><div class="metric-value">${formatMs(summary.renderFrame?.avg)} ${statusBadge(budgetStatus.renderFrameP95)}</div></div>
            <div class="card"><div class="metric-label">Long tasks avg</div><div class="metric-value">${summary.longTasks}</div></div>
            <div class="card"><div class="metric-label">SVG elements</div><div class="metric-value">${collected.dom.svgElements}</div></div>
          </section>
          <section class="section">
            <h2>Metrics</h2>
            <table>
              <thead><tr><th>Metric</th><th class="number">Value</th><th>Status</th></tr></thead>
              <tbody>
                ${metricRows.map(([label, value, status]) => `
                  <tr>
                    <td>${escapeHtml(label)}</td>
                    <td class="number">${escapeHtml(value)}</td>
                    <td>${status}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </section>
          <section class="section">
            <h2>Runs</h2>
            <table>
              <thead><tr><th>Run</th><th class="number">App init</th><th class="number">Render p95</th><th class="number">Load</th><th class="number">Long tasks</th></tr></thead>
              <tbody>
                ${report.runs.map((run) => `
                  <tr>
                    <td>${run.runIndex}</td>
                    <td class="number">${formatMs(run.summary.appInit)}</td>
                    <td class="number">${formatMs(run.summary.renderFrame?.p95)}</td>
                    <td class="number">${formatMs(run.summary.browserLoadDurationMs)}</td>
                    <td class="number">${run.summary.longTasks}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </section>
          <section class="section">
            <h2>Budgets</h2>
            <table>
              <tbody>
                <tr><td>App init budget</td><td class="number">${budgets.appInitMs} ms</td></tr>
                <tr><td>Render frame p95 budget</td><td class="number">${budgets.renderFrameP95Ms} ms</td></tr>
              </tbody>
            </table>
          </section>
        `,
      }),
      'utf8',
    ),
    fs.writeFile(
      path.join(reportsDir, 'index.html'),
      pageShell({
        title: 'Mind Palace Performance Reports',
        subtitle: `Generated: ${report.generatedAt} · Browser runs: ${report.runCount}`,
        body: `
          <section class="grid">
            <a class="card" href="./build.html">
              <div class="metric-label">Build report</div>
              <div class="metric-value">构建体积</div>
              <div class="small">JS/CSS 体积、gzip、预算状态</div>
            </a>
            <a class="card" href="./browser-${escapeHtml(datasetName)}.html">
              <div class="metric-label">Browser report</div>
              <div class="metric-value">${escapeHtml(datasetName)}</div>
              <div class="small">启动、存储、图谱渲染、DOM/SVG 指标</div>
            </a>
          </section>
          <section class="section">
            <h2>Current Snapshot</h2>
            <table>
              <tbody>
                <tr><td>App init avg</td><td class="number">${formatMs(summary.appInit)} ${statusBadge(budgetStatus.appInit)}</td></tr>
                <tr><td>Render frame p95 avg</td><td class="number">${formatMs(summary.renderFrame?.avg)} ${statusBadge(budgetStatus.renderFrameP95)}</td></tr>
                <tr><td>Long tasks avg</td><td class="number">${summary.longTasks}</td></tr>
                <tr><td>SVG elements</td><td class="number">${collected.dom.svgElements}</td></tr>
              </tbody>
            </table>
          </section>
          <section class="section small">
            原始 JSON 和 Markdown 仍保留在同一目录，方便后续做趋势对比。
          </section>
        `,
      }),
      'utf8',
    ),
  ]);
}

await fs.mkdir(reportsDir, { recursive: true });
if (!(await fileExists(datasetPath))) {
  await runNodeScript(path.join(root, 'scripts/perf-generate-data.mjs'));
}
await fs.copyFile(datasetPath, runtimeDataPath);

const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    MIND_PALACE_DATA_FILE: runtimeDataPath,
  },
});

server.stdout.on('data', (chunk) => process.stdout.write(chunk));
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

let browser;
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await launchBrowser();
  const runs = [];
  for (let index = 1; index <= runCount; index += 1) {
    console.log(`Browser perf run ${index}/${runCount}`);
    runs.push(await collectBrowserRun(browser, index));
  }

  const summary = aggregateRuns(runs);
  const budgets = browserBudgets();
  const budgetStatus = statusFor(summary, budgets);
  const report = {
    generatedAt: new Date().toISOString(),
    dataset: datasetName,
    runCount,
    runtimeDataPath,
    url,
    budgets,
    budgetStatus,
    summary,
    runs,
    collected: runs.at(-1)?.collected,
  };

  await writeReportFiles(report, runs.at(-1));
  console.log(`Browser performance report written to ${path.relative(root, path.join(reportsDir, `browser-${datasetName}.md`))}`);
} finally {
  if (browser) await browser.close();
  await stopProcessTree(server);
}
