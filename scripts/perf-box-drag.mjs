import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { escapeHtml, formatMs, pageShell, statusBadge } from './lib/perf-report-html.mjs';

const root = process.cwd();
const perfDir = path.join(root, '.perf');
const reportsDir = path.join(perfDir, 'reports');
const runtimeDataPath = path.join(perfDir, 'box-drag-runtime-data.json');
const port = Number(process.env.PERF_BOX_PORT ?? 5177);
const url = `http://127.0.0.1:${port}/?perf=1&scenario=box-drag`;
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

function makeBoxDragData() {
  const createdAt = '2026-01-01T00:00:00.000Z';
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 140; i += 1) {
    const inList = i < 32;
    nodes.push({
      id: `box-node-${i}`,
      label: `Box drag node ${i}`,
      type: i % 5 === 0 ? 'task' : i % 3 === 0 ? 'project' : 'concept',
      layer: 'semantic',
      parent_id: null,
      content: `Generated box drag node ${i}`,
      tags: ['perf-box-drag'],
      status: i % 5 === 0 ? 'active' : undefined,
      x: inList ? 0 : (i % 14) * 90 - 620,
      y: inList ? 0 : Math.floor(i / 14) * 85 - 420,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
  for (let i = 0; i < 220; i += 1) {
    edges.push({
      id: `box-edge-${i}`,
      source: `box-node-${i % nodes.length}`,
      target: `box-node-${(i * 7 + 13) % nodes.length}`,
      source_kind: 'node',
      target_kind: 'node',
      type: i % 4 === 0 ? 'depends_on' : 'relates_to',
      weight: 1,
    });
  }
  const listNodeIds = nodes.slice(0, 32).map((node) => node.id);
  return {
    focus: [
      {
        id: 'box-focus',
        title: 'Box drag focus',
        domain: 'work',
        status: 'active',
        color: '#22c55e',
        sort_order: 0,
        linked_node_ids: listNodeIds.slice(0, 6),
        created_at: createdAt,
      },
    ],
    nodes,
    edges,
    groups: [
      {
        id: 'box-list-group',
        name: 'Drag Test Box',
        color: '#38bdf8',
        node_ids: listNodeIds,
        views: [
          {
            id: 'box-list-view',
            name: '列表',
            type: 'list',
            node_order: listNodeIds,
            created_at: createdAt,
          },
        ],
        active_view_id: 'box-list-view',
        parent_id: null,
        x: -220,
        y: -260,
        width: 480,
        height: 720,
        created_at: createdAt,
      },
    ],
  };
}

async function getScenarioPoints(page) {
  return page.evaluate(() => {
    const nodeElements = [...document.querySelectorAll('g.node')];
    const listNode = nodeElements.find((el) => el.__data__?.viewMode === 'list');
    const box = document.querySelector('g.network-box');
    if (!listNode || !box) {
      return null;
    }
    const nodeRect = listNode.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const svgRect = document.querySelector('svg')?.getBoundingClientRect() ?? {
      left: 0,
      right: window.innerWidth,
      top: 0,
      bottom: window.innerHeight,
    };
    const rightOutsideX = boxRect.right + 180;
    const leftOutsideX = boxRect.left - 180;
    const outsideX = rightOutsideX <= svgRect.right - 80
      ? rightOutsideX
      : Math.max(svgRect.left + 80, leftOutsideX);
    return {
      nodeId: listNode.__data__.id,
      start: {
        x: nodeRect.left + nodeRect.width / 2,
        y: nodeRect.top + nodeRect.height / 2,
      },
      outside: {
        x: outsideX,
        y: Math.min(svgRect.bottom - 80, Math.max(svgRect.top + 80, boxRect.top + 130)),
      },
      inside: {
        x: boxRect.left + boxRect.width / 2,
        y: boxRect.top + 120,
      },
      box: {
        left: boxRect.left,
        top: boxRect.top,
        right: boxRect.right,
        bottom: boxRect.bottom,
      },
    };
  });
}

async function getOffsetDragOutPoints(page, nodeId) {
  return page.evaluate((id) => {
    const node = [...document.querySelectorAll('g.node')].find((el) => el.__data__?.id === id);
    const box = document.querySelector('g.network-box');
    const root = document.querySelector('g.graph-root');
    if (!node || !box) return null;
    const toGraphPoint = (point) => {
      const svg = document.querySelector('svg');
      const matrix = root?.getScreenCTM()?.inverse();
      if (!svg || !matrix) return point;
      const converted = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: converted.x, y: converted.y };
    };
    const nodeRect = node.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const svgRect = document.querySelector('svg')?.getBoundingClientRect() ?? {
      left: 0,
      right: window.innerWidth,
      top: 0,
      bottom: window.innerHeight,
    };
    const rightOutsideX = boxRect.right + 180;
    const leftOutsideX = boxRect.left - 180;
    const outsideX = rightOutsideX <= svgRect.right - 80
      ? rightOutsideX
      : Math.max(svgRect.left + 80, leftOutsideX);
    const center = {
      x: nodeRect.left + nodeRect.width / 2,
      y: nodeRect.top + nodeRect.height / 2,
    };
    const start = {
      x: nodeRect.left + Math.min(28, Math.max(8, nodeRect.width * 0.25)),
      y: nodeRect.top + Math.min(14, Math.max(8, nodeRect.height * 0.35)),
    };
    const outside = {
      x: outsideX,
      y: Math.min(svgRect.bottom - 80, Math.max(svgRect.top + 80, boxRect.top + 240)),
    };
    const outsideGraph = toGraphPoint(outside);
    return {
      start,
      outside,
      expectedGraphPosition: {
        x: outsideGraph.x,
        y: outsideGraph.y,
      },
    };
  }, nodeId);
}

async function getNodeDataPosition(page, nodeId) {
  return page.evaluate((id) => {
    const node = [...document.querySelectorAll('g.node')].find((el) => el.__data__?.id === id);
    if (!node) return null;
    return {
      x: node.__data__?.x ?? null,
      y: node.__data__?.y ?? null,
    };
  }, nodeId);
}

async function startFrameMonitor(page, label) {
  await page.evaluate((monitorLabel) => {
    window.__boxDragMonitor = {
      label: monitorLabel,
      frames: [],
      longTasks: [],
      startedAt: performance.now(),
      raf: 0,
      last: performance.now(),
      stopped: false,
    };
    try {
      window.__boxDragLongTaskObserver?.disconnect?.();
      window.__boxDragLongTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__boxDragMonitor?.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      window.__boxDragLongTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      // Long Task API may be unavailable in this context.
    }
    const tick = (now) => {
      const monitor = window.__boxDragMonitor;
      if (!monitor || monitor.stopped) return;
      monitor.frames.push(now - monitor.last);
      monitor.last = now;
      monitor.raf = requestAnimationFrame(tick);
    };
    window.__boxDragMonitor.raf = requestAnimationFrame(tick);
  }, label);
}

async function stopFrameMonitor(page) {
  return page.evaluate(() => {
    const monitor = window.__boxDragMonitor;
    if (!monitor) return null;
    monitor.stopped = true;
    cancelAnimationFrame(monitor.raf);
    window.__boxDragLongTaskObserver?.disconnect?.();
    return {
      label: monitor.label,
      duration: performance.now() - monitor.startedAt,
      frames: monitor.frames,
      longTasks: monitor.longTasks,
      measures: window.__mindPalacePerf?.measures ?? [],
    };
  });
}

async function dragPath(page, from, to, steps = 42) {
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

function summarizeDrag(result) {
  const frameStats = numberStats(result?.frames ?? []);
  const measures = result?.measures ?? [];
  const measureStats = Object.fromEntries(
    [
      'history:capture-snapshot',
      'graph:commit-list-drag',
      'graph:commit-list-drag:sync-derived-edges',
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
  const drift = summary.positionDrift ?? 0;
  return {
    p95: p95 <= 34 ? 'pass' : 'fail',
    maxFrame: maxFrame <= 80 ? 'pass' : 'fail',
    longTasks: summary.longTasks === 0 ? 'pass' : 'fail',
    position: drift <= 16 ? 'pass' : 'fail',
  };
}

await fs.mkdir(reportsDir, { recursive: true });
await fs.mkdir(path.dirname(runtimeDataPath), { recursive: true });
await fs.writeFile(runtimeDataPath, `${JSON.stringify(makeBoxDragData(), null, 2)}\n`, 'utf8');

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
  await page.waitForSelector('g.network-box', { timeout: 30000 });
  await page.waitForSelector('g.node', { timeout: 30000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const initialPoints = await getScenarioPoints(page);
  if (!initialPoints) throw new Error('Could not locate a list node and network box for the drag scenario.');

  await startFrameMonitor(page, 'drag-out');
  await dragPath(page, initialPoints.start, initialPoints.outside);
  const dragOut = summarizeDrag(await stopFrameMonitor(page));

  const afterOutPoints = await getScenarioPoints(page);
  const reentryStart = afterOutPoints?.start ?? initialPoints.outside;
  await startFrameMonitor(page, 'drag-in');
  await dragPath(page, reentryStart, initialPoints.inside);
  const dragIn = summarizeDrag(await stopFrameMonitor(page));

  await page.waitForTimeout(250);
  const finalOutPoints = await getOffsetDragOutPoints(page, initialPoints.nodeId);
  if (!finalOutPoints) throw new Error('Could not locate re-entered list node for the final drag-out scenario.');
  await startFrameMonitor(page, 'drag-out-after-reentry');
  await dragPath(page, finalOutPoints.start, finalOutPoints.outside);
  const dragOutAfterReentry = summarizeDrag(await stopFrameMonitor(page));
  const finalPosition = await getNodeDataPosition(page, initialPoints.nodeId);
  dragOutAfterReentry.positionDrift = finalPosition
    ? Math.hypot(
        finalPosition.x - finalOutPoints.expectedGraphPosition.x,
        finalPosition.y - finalOutPoints.expectedGraphPosition.y,
      )
    : null;

  const screenshotPath = path.join(reportsDir, 'box-drag.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const summaries = [dragOut, dragIn, dragOutAfterReentry];
  const report = {
    generatedAt: new Date().toISOString(),
    url,
    runtimeDataPath,
    initialPoints,
    finalOutPoints,
    finalPosition,
    summaries,
    status: Object.fromEntries(summaries.map((summary) => [summary.label, statusForDrag(summary)])),
    screenshot: screenshotPath,
  };

  const jsonPath = path.join(reportsDir, 'box-drag.json');
  const htmlPath = path.join(reportsDir, 'box-drag.html');
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
        <td class="number">${summary.positionDrift == null ? '—' : `${summary.positionDrift.toFixed(1)}px`} ${summary.positionDrift == null ? '' : statusBadge(status.position)}</td>
      </tr>
    `;
  }).join('');

  await fs.writeFile(
    htmlPath,
    pageShell({
      title: 'Mind Palace Box Drag Performance',
      subtitle: `Generated: ${report.generatedAt}`,
      body: `
        <div class="links">
          <a href="./index.html">报告首页</a>
          <a href="./box-drag.json">原始 JSON</a>
          <a href="./box-drag.png">截图</a>
        </div>
        <section class="section grid">
          <div class="card"><div class="metric-label">Drag out p95</div><div class="metric-value">${formatMs(dragOut.frameStats?.p95)} ${statusBadge(statusForDrag(dragOut).p95)}</div></div>
          <div class="card"><div class="metric-label">Drag in p95</div><div class="metric-value">${formatMs(dragIn.frameStats?.p95)} ${statusBadge(statusForDrag(dragIn).p95)}</div></div>
          <div class="card"><div class="metric-label">Drag out max frame</div><div class="metric-value">${formatMs(dragOut.frameStats?.max)}</div></div>
          <div class="card"><div class="metric-label">Drag in max frame</div><div class="metric-value">${formatMs(dragIn.frameStats?.max)}</div></div>
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
                <th class="number">Position Drift</th>
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
                <th class="number">History</th>
                <th class="number">Commit</th>
                <th class="number">Derived Edges</th>
                <th class="number">Stringify</th>
                <th class="number">Save</th>
              </tr>
            </thead>
            <tbody>
              ${summaries.map((summary) => `
                <tr>
                  <td>${escapeHtml(summary.label)}</td>
                  <td class="number">${formatMs(summary.measureStats['history:capture-snapshot']?.max)}</td>
                  <td class="number">${formatMs(summary.measureStats['graph:commit-list-drag']?.max)}</td>
                  <td class="number">${formatMs(summary.measureStats['graph:commit-list-drag:sync-derived-edges']?.max)}</td>
                  <td class="number">${formatMs(summary.measureStats['storage:stringify']?.max)}</td>
                  <td class="number">${formatMs(summary.measureStats['storage:save']?.max)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
        <section class="section">
          <h2>Screenshot</h2>
          <img src="./box-drag.png" alt="Box drag scenario screenshot" style="max-width:100%;border:1px solid var(--line);border-radius:8px;">
        </section>
      `,
    }),
    'utf8',
  );

  console.log(`Box drag performance report written to ${path.relative(root, htmlPath)}`);
} finally {
  if (browser) await browser.close();
  await stopProcessTree(server);
}
