import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { escapeHtml, formatMs, pageShell, statusBadge } from './lib/perf-report-html.mjs';

const root = process.cwd();
const perfDir = path.join(root, '.perf');
const reportsDir = path.join(perfDir, 'reports');
const runtimeDataPath = path.join(perfDir, 'canvas-pan-runtime-data.json');
const port = Number(process.env.PERF_CANVAS_PAN_PORT ?? 5179);
const url = `http://127.0.0.1:${port}/?perf=1&scenario=canvas-pan`;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

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
    for (const channel of ['msedge', 'chrome']) {
      try {
        return await chromium.launch({ channel, headless: true });
      } catch {
        // Try the next installed browser channel.
      }
    }
    throw error;
  }
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

function makeCanvasPanData() {
  const createdAt = '2026-01-01T00:00:00.000Z';
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 420; i += 1) {
    nodes.push({
      id: `pan-node-${i}`,
      label: `Canvas pan node ${i}`,
      type: i % 7 === 0 ? 'task' : i % 5 === 0 ? 'project' : i % 3 === 0 ? 'question' : 'concept',
      layer: 'semantic',
      parent_id: null,
      content: `Generated canvas pan node ${i}`,
      tags: ['perf-canvas-pan'],
      status: i % 11 === 0 ? 'active' : undefined,
      x: (i % 28) * 92 - 1250,
      y: Math.floor(i / 28) * 84 - 560,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
  for (let i = 0; i < 920; i += 1) {
    edges.push({
      id: `pan-edge-${i}`,
      source: `pan-node-${i % nodes.length}`,
      target: `pan-node-${(i * 9 + 17) % nodes.length}`,
      source_kind: 'node',
      target_kind: 'node',
      type: i % 6 === 0 ? 'depends_on' : i % 4 === 0 ? 'part_of' : 'relates_to',
      weight: 1,
    });
  }
  return {
    focus: [
      {
        id: 'canvas-pan-focus',
        title: 'Canvas pan focus',
        domain: 'work',
        status: 'active',
        color: '#22c55e',
        sort_order: 0,
        linked_node_ids: ['pan-node-0', 'pan-node-1', 'pan-node-2'],
        created_at: createdAt,
      },
    ],
    nodes,
    edges,
    groups: [],
  };
}

async function startFrameMonitor(page, label) {
  await page.evaluate((monitorLabel) => {
    window.__canvasPanMonitor = {
      label: monitorLabel,
      frames: [],
      longTasks: [],
      startedAt: performance.now(),
      raf: 0,
      last: performance.now(),
      stopped: false,
    };
    try {
      window.__canvasPanLongTaskObserver?.disconnect?.();
      window.__canvasPanLongTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__canvasPanMonitor?.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      window.__canvasPanLongTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      // Long Task API may be unavailable in this context.
    }
    const tick = (now) => {
      const monitor = window.__canvasPanMonitor;
      if (!monitor || monitor.stopped) return;
      monitor.frames.push(now - monitor.last);
      monitor.last = now;
      monitor.raf = requestAnimationFrame(tick);
    };
    window.__canvasPanMonitor.raf = requestAnimationFrame(tick);
  }, label);
}

async function stopFrameMonitor(page) {
  return page.evaluate(() => {
    const monitor = window.__canvasPanMonitor;
    if (!monitor) return null;
    monitor.stopped = true;
    cancelAnimationFrame(monitor.raf);
    window.__canvasPanLongTaskObserver?.disconnect?.();
    return {
      label: monitor.label,
      duration: performance.now() - monitor.startedAt,
      frames: monitor.frames,
      longTasks: monitor.longTasks,
      measures: window.__mindPalacePerf?.measures ?? [],
      counters: window.__mindPalacePerf?.counters ?? {},
    };
  });
}

async function getPanPoints(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-perf="mind-graph-canvas"]');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      start: { x: rect.left + rect.width * 0.34, y: rect.top + rect.height * 0.42 },
      end: { x: rect.left + rect.width * 0.72, y: rect.top + rect.height * 0.66 },
      canvas: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
    };
  });
}

async function dragPath(page, from, to, steps = 64) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    await page.mouse.move(
      from.x + (to.x - from.x) * ease,
      from.y + (to.y - from.y) * ease,
    );
  }
  await page.mouse.up();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

function summarizePan(result) {
  const frameStats = numberStats(result?.frames ?? []);
  const measures = result?.measures ?? [];
  const measureStats = Object.fromEntries(
    [
      'graph:zoom-apply-transform',
      'graph:zoom-save-view',
      'graph:render-frame',
    ].map((name) => [
      name,
      numberStats(
        measures
          .filter((entry) => entry.name === name)
          .map((entry) => entry.duration),
      ),
    ]),
  );
  return {
    label: result?.label ?? 'unknown',
    duration: result?.duration ?? null,
    frameCount: result?.frames?.length ?? 0,
    frameStats,
    longTasks: result?.longTasks?.length ?? 0,
    longTaskDuration: (result?.longTasks ?? []).reduce((sum, task) => sum + task.duration, 0),
    zoomEvents: result?.counters?.['graph:zoom:event'] ?? 0,
    measureStats,
  };
}

function statusForPan(summary) {
  const maxFrame = summary.frameStats?.max ?? 0;
  const p95 = summary.frameStats?.p95 ?? 0;
  return {
    p95: p95 <= 34 ? 'pass' : 'fail',
    maxFrame: maxFrame <= 80 ? 'pass' : 'fail',
    longTasks: summary.longTasks === 0 ? 'pass' : 'fail',
  };
}

await fs.mkdir(reportsDir, { recursive: true });
await fs.mkdir(path.dirname(runtimeDataPath), { recursive: true });
await fs.writeFile(runtimeDataPath, `${JSON.stringify(makeCanvasPanData(), null, 2)}\n`, 'utf8');

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mindPalacePerf?.marks.some((entry) => entry.name === 'app:ready'), null, { timeout: 30000 });
  await page.waitForSelector('[data-perf="mind-graph-canvas"]', { timeout: 30000 });
  await page.waitForSelector('g.node', { timeout: 30000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const points = await getPanPoints(page);
  if (!points) throw new Error('Could not locate graph canvas for the pan scenario.');

  await startFrameMonitor(page, 'canvas-pan');
  await dragPath(page, points.start, points.end);
  const canvasPan = summarizePan(await stopFrameMonitor(page));

  const screenshotPath = path.join(reportsDir, 'canvas-pan.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const summaries = [canvasPan];
  const report = {
    generatedAt: new Date().toISOString(),
    url,
    runtimeDataPath,
    points,
    summaries,
    status: Object.fromEntries(summaries.map((summary) => [summary.label, statusForPan(summary)])),
    screenshot: screenshotPath,
  };

  const jsonPath = path.join(reportsDir, 'canvas-pan.json');
  const htmlPath = path.join(reportsDir, 'canvas-pan.html');
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const rows = summaries.map((summary) => {
    const status = statusForPan(summary);
    return `
      <tr>
        <td>${escapeHtml(summary.label)}</td>
        <td class="number">${formatMs(summary.duration)}</td>
        <td class="number">${summary.frameCount}</td>
        <td class="number">${formatMs(summary.frameStats?.avg)}</td>
        <td class="number">${formatMs(summary.frameStats?.p95)} ${statusBadge(status.p95)}</td>
        <td class="number">${formatMs(summary.frameStats?.max)} ${statusBadge(status.maxFrame)}</td>
        <td class="number">${summary.longTasks} ${statusBadge(status.longTasks)}</td>
        <td class="number">${summary.zoomEvents}</td>
      </tr>
    `;
  }).join('');

  await fs.writeFile(
    htmlPath,
    pageShell({
      title: 'Mind Palace Canvas Pan Performance',
      subtitle: `Generated: ${report.generatedAt}`,
      body: `
        <div class="links">
          <a href="./index.html">报告首页</a>
          <a href="./canvas-pan.json">原始 JSON</a>
          <a href="./canvas-pan.png">截图</a>
        </div>
        <section class="section grid">
          <div class="card"><div class="metric-label">Pan p95</div><div class="metric-value">${formatMs(canvasPan.frameStats?.p95)} ${statusBadge(statusForPan(canvasPan).p95)}</div></div>
          <div class="card"><div class="metric-label">Pan max frame</div><div class="metric-value">${formatMs(canvasPan.frameStats?.max)} ${statusBadge(statusForPan(canvasPan).maxFrame)}</div></div>
          <div class="card"><div class="metric-label">Long tasks</div><div class="metric-value">${canvasPan.longTasks} ${statusBadge(statusForPan(canvasPan).longTasks)}</div></div>
          <div class="card"><div class="metric-label">Zoom events</div><div class="metric-value">${canvasPan.zoomEvents}</div></div>
        </section>
        <section class="section">
          <h2>Pan Metrics</h2>
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th class="number">Duration</th>
                <th class="number">Frames</th>
                <th class="number">Frame Avg</th>
                <th class="number">Frame P95</th>
                <th class="number">Frame Max</th>
                <th class="number">Long Tasks</th>
                <th class="number">Zoom Events</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
        <section class="section">
          <h2>Zoom Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th class="number">Apply Transform</th>
                <th class="number">Save View</th>
                <th class="number">Graph Render Frame</th>
              </tr>
            </thead>
            <tbody>
              ${summaries.map((summary) => `
                <tr>
                  <td>${escapeHtml(summary.label)}</td>
                  <td class="number">${formatMs(summary.measureStats['graph:zoom-apply-transform']?.max)}</td>
                  <td class="number">${formatMs(summary.measureStats['graph:zoom-save-view']?.max)}</td>
                  <td class="number">${formatMs(summary.measureStats['graph:render-frame']?.max)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
        <section class="section">
          <h2>Screenshot</h2>
          <img src="./canvas-pan.png" alt="Canvas pan scenario screenshot" style="max-width:100%;border:1px solid var(--line);border-radius:8px;">
        </section>
      `,
    }),
    'utf8',
  );

  console.log(`Canvas pan performance report written to ${path.relative(root, htmlPath)}`);
} finally {
  if (browser) await browser.close();
  await stopProcessTree(server);
}
