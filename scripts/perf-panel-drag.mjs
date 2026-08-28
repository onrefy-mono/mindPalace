import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { escapeHtml, formatMs, pageShell, statusBadge } from './lib/perf-report-html.mjs';

const root = process.cwd();
const perfDir = path.join(root, '.perf');
const reportsDir = path.join(perfDir, 'reports');
const runtimeDataPath = path.join(perfDir, 'panel-drag-runtime-data.json');
const debugLogPath = path.join(perfDir, 'panel-drag-debug.log');
const port = Number(process.env.PERF_PANEL_PORT ?? 5178);
const groupId = 'panel-drag-group';
const viewId = 'panel-drag-list-view';
const url = `http://127.0.0.1:${port}/?perf=1&scenario=panel-drag#/box-view/${groupId}/${viewId}`;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

async function logStep(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  await fs.appendFile(debugLogPath, `${line}\n`, 'utf8');
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

function makePanelDragData() {
  const createdAt = '2026-01-01T00:00:00.000Z';
  const nodes = [];
  for (let i = 0; i < 220; i += 1) {
    nodes.push({
      id: `panel-node-${i}`,
      label: `Panel drag node ${String(i).padStart(3, '0')}`,
      type: i % 5 === 0 ? 'task' : i % 3 === 0 ? 'project' : 'concept',
      layer: 'semantic',
      parent_id: null,
      content: `Generated panel drag content ${i}. This row is intentionally non-empty to exercise layout and paint work.`,
      tags: ['perf-panel-drag', `batch-${i % 8}`],
      status: i % 4 === 0 ? 'active' : undefined,
      x: (i % 18) * 86 - 720,
      y: Math.floor(i / 18) * 72 - 360,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
  const nodeIds = nodes.map((node) => node.id);
  return {
    focus: [],
    nodes,
    edges: [],
    groups: [
      {
        id: groupId,
        name: 'Panel Drag Performance',
        color: '#38bdf8',
        node_ids: nodeIds,
        views: [
          {
            id: viewId,
            name: '列表',
            type: 'list',
            node_order: nodeIds,
            created_at: createdAt,
          },
        ],
        active_view_id: viewId,
        parent_id: null,
        x: -260,
        y: -320,
        width: 560,
        height: 760,
        created_at: createdAt,
      },
    ],
  };
}

async function startFrameMonitor(page, label) {
  await page.evaluate((monitorLabel) => {
    window.__panelDragMonitor = {
      label: monitorLabel,
      frames: [],
      longTasks: [],
      startedAt: performance.now(),
      raf: 0,
      last: performance.now(),
      stopped: false,
    };
    try {
      window.__panelDragLongTaskObserver?.disconnect?.();
      window.__panelDragLongTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__panelDragMonitor?.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      window.__panelDragLongTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      // Long Task API may be unavailable in this context.
    }
    const tick = (now) => {
      const monitor = window.__panelDragMonitor;
      if (!monitor || monitor.stopped) return;
      monitor.frames.push(now - monitor.last);
      monitor.last = now;
      monitor.raf = requestAnimationFrame(tick);
    };
    window.__panelDragMonitor.raf = requestAnimationFrame(tick);
  }, label);
}

async function stopFrameMonitor(page) {
  return page.evaluate(() => {
    const monitor = window.__panelDragMonitor;
    if (!monitor) return null;
    monitor.stopped = true;
    cancelAnimationFrame(monitor.raf);
    window.__panelDragLongTaskObserver?.disconnect?.();
    return {
      label: monitor.label,
      duration: performance.now() - monitor.startedAt,
      frames: monitor.frames,
      longTasks: monitor.longTasks,
      measures: window.__mindPalacePerf?.measures ?? [],
    };
  });
}

async function getDragPoints(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-perf="box-view-list-row"]')];
    const list = document.querySelector('[data-perf="box-view-list"]');
    if (rows.length < 60 || !list) return null;
    const fromRect = rows[5].getBoundingClientRect();
    const toRect = rows[42].getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    return {
      rowCount: rows.length,
      start: { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 },
      end: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
      list: {
        left: listRect.left,
        top: listRect.top,
        right: listRect.right,
        bottom: listRect.bottom,
      },
    };
  });
}

async function dispatchPanelDrag(page) {
  await logStep('Dispatching panel drag events...');
  await page.evaluate(async () => {
    const rows = [...document.querySelectorAll('[data-perf="box-view-list-row"]')];
    const list = document.querySelector('[data-perf="box-view-list"]');
    if (rows.length < 60 || !list) throw new Error('Not enough rows to dispatch panel drag.');

    const dataTransfer = new DataTransfer();
    const dragged = rows[5];
    const targetRows = rows.slice(6, 43);
    const eventInit = (element, clientY) => {
      const rect = element.getBoundingClientRect();
      return {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rect.left + rect.width / 2,
        clientY,
      };
    };
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const draggedRect = dragged.getBoundingClientRect();
    dragged.dispatchEvent(new DragEvent('dragstart', eventInit(dragged, draggedRect.top + draggedRect.height / 2)));
    await waitFrame();

    for (const row of targetRows) {
      const rect = row.getBoundingClientRect();
      row.dispatchEvent(new DragEvent('dragover', eventInit(row, rect.top + rect.height * 0.75)));
      await waitFrame();
    }

    const finalRow = targetRows.at(-1);
    const finalRect = finalRow.getBoundingClientRect();
    list.dispatchEvent(new DragEvent('drop', eventInit(finalRow, finalRect.top + finalRect.height * 0.75)));
    dragged.dispatchEvent(new DragEvent('dragend', eventInit(dragged, draggedRect.top + draggedRect.height / 2)));
    await waitFrame();
    await waitFrame();
  });
}

function summarizeDrag(result) {
  const frameStats = numberStats(result?.frames ?? []);
  const measures = result?.measures ?? [];
  const measureStats = Object.fromEntries(
    [
      'graph:update-group-view-node-order',
      'storage:stringify',
      'storage:save',
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
    measureStats,
  };
}

function statusForDrag(summary) {
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
await fs.writeFile(debugLogPath, '', 'utf8');
await logStep('Writing runtime data...');
await fs.writeFile(runtimeDataPath, `${JSON.stringify(makePanelDragData(), null, 2)}\n`, 'utf8');
await logStep('Starting Vite...');

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
  await logStep(`Waiting for ${port}...`);
  await waitForServer(`http://127.0.0.1:${port}/`);
  await logStep('Launching browser...');
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.error(`[browser:error] ${error.message}`));
  await logStep(`Opening ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await logStep('Waiting for panel rows...');
  await page.waitForSelector('[data-perf="box-view-list-row"]', { timeout: 30000 });
  await page.waitForFunction(() => window.__mindPalacePerf?.marks.some((entry) => entry.name === 'app:ready'), null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const points = await getDragPoints(page);
  if (!points) throw new Error('Could not locate enough panel rows for the drag scenario.');
  await logStep(`Located ${points.rowCount} panel rows.`);

  await startFrameMonitor(page, 'panel-row-reorder');
  await dispatchPanelDrag(page);
  await logStep('Stopping frame monitor...');
  const panelDrag = summarizeDrag(await stopFrameMonitor(page));

  const screenshotPath = path.join(reportsDir, 'panel-drag.png');
  await logStep('Taking screenshot...');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const summaries = [panelDrag];
  const report = {
    generatedAt: new Date().toISOString(),
    url,
    runtimeDataPath,
    points,
    summaries,
    status: Object.fromEntries(summaries.map((summary) => [summary.label, statusForDrag(summary)])),
    screenshot: screenshotPath,
  };

  const jsonPath = path.join(reportsDir, 'panel-drag.json');
  const htmlPath = path.join(reportsDir, 'panel-drag.html');
  await logStep('Writing reports...');
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const rows = summaries.map((summary) => {
    const status = statusForDrag(summary);
    return `
      <tr>
        <td>${escapeHtml(summary.label)}</td>
        <td class="number">${formatMs(summary.duration)}</td>
        <td class="number">${summary.frameCount}</td>
        <td class="number">${formatMs(summary.frameStats?.avg)}</td>
        <td class="number">${formatMs(summary.frameStats?.p95)} ${statusBadge(status.p95)}</td>
        <td class="number">${formatMs(summary.frameStats?.max)} ${statusBadge(status.maxFrame)}</td>
        <td class="number">${summary.longTasks} ${statusBadge(status.longTasks)}</td>
      </tr>
    `;
  }).join('');

  await fs.writeFile(
    htmlPath,
    pageShell({
      title: 'Mind Palace Panel Drag Performance',
      subtitle: `Generated: ${report.generatedAt}`,
      body: `
        <div class="links">
          <a href="./index.html">报告首页</a>
          <a href="./panel-drag.json">原始 JSON</a>
          <a href="./panel-drag.png">截图</a>
        </div>
        <section class="section grid">
          <div class="card"><div class="metric-label">Panel drag p95</div><div class="metric-value">${formatMs(panelDrag.frameStats?.p95)} ${statusBadge(statusForDrag(panelDrag).p95)}</div></div>
          <div class="card"><div class="metric-label">Panel drag max frame</div><div class="metric-value">${formatMs(panelDrag.frameStats?.max)} ${statusBadge(statusForDrag(panelDrag).maxFrame)}</div></div>
          <div class="card"><div class="metric-label">Long tasks</div><div class="metric-value">${panelDrag.longTasks} ${statusBadge(statusForDrag(panelDrag).longTasks)}</div></div>
          <div class="card"><div class="metric-label">Rows</div><div class="metric-value">${points.rowCount}</div></div>
        </section>
        <section class="section">
          <h2>Drag Metrics</h2>
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
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
        <section class="section">
          <h2>Drop Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th class="number">Order Commit</th>
                <th class="number">Stringify</th>
                <th class="number">Save</th>
              </tr>
            </thead>
            <tbody>
              ${summaries.map((summary) => `
                <tr>
                  <td>${escapeHtml(summary.label)}</td>
                  <td class="number">${formatMs(summary.measureStats['graph:update-group-view-node-order']?.max)}</td>
                  <td class="number">${formatMs(summary.measureStats['storage:stringify']?.max)}</td>
                  <td class="number">${formatMs(summary.measureStats['storage:save']?.max)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
        <section class="section">
          <h2>Screenshot</h2>
          <img src="./panel-drag.png" alt="Panel drag scenario screenshot" style="max-width:100%;border:1px solid var(--line);border-radius:8px;">
        </section>
      `,
    }),
    'utf8',
  );

  console.log(`Panel drag performance report written to ${path.relative(root, htmlPath)}`);
} finally {
  if (browser) await browser.close();
  await stopProcessTree(server);
}
