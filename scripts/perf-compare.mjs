import fs from 'node:fs/promises';
import path from 'node:path';
import { escapeHtml, formatBytes, formatMs, pageShell, statusBadge } from './lib/perf-report-html.mjs';

const root = process.cwd();
const reportsDir = path.join(root, '.perf', 'reports');
const datasetName = process.env.PERF_DATASET ?? 'medium';

async function readJson(name) {
  return JSON.parse(await fs.readFile(path.join(reportsDir, name), 'utf8'));
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function delta(before, after) {
  const a = number(before);
  const b = number(after);
  if (a == null || b == null) return { value: null, percent: null };
  return {
    value: b - a,
    percent: a === 0 ? null : ((b - a) / a) * 100,
  };
}

function formatDelta(before, after, formatter = formatMs, lowerIsBetter = true) {
  const change = delta(before, after);
  if (change.value == null) return '<span class="small">n/a</span>';
  const isBetter = lowerIsBetter ? change.value <= 0 : change.value >= 0;
  const sign = change.value > 0 ? '+' : '';
  const percent = change.percent == null ? '' : ` (${sign}${change.percent.toFixed(1)}%)`;
  const cls = isBetter ? 'pass' : 'fail';
  return `<span class="badge ${cls}">${escapeHtml(`${sign}${formatter(Math.abs(change.value)).replace(/^0\\.00 /, '0 ')}${percent}`)}</span>`;
}

function row(label, before, after, formatter = formatMs, lowerIsBetter = true) {
  return `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td class="number">${escapeHtml(formatter(before))}</td>
      <td class="number">${escapeHtml(formatter(after))}</td>
      <td>${formatDelta(before, after, formatter, lowerIsBetter)}</td>
    </tr>
  `;
}

function countRow(label, before, after, lowerIsBetter = true) {
  const formatter = (value) => (value == null ? 'n/a' : String(Math.round(value)));
  return row(label, before, after, formatter, lowerIsBetter);
}

function renderFrameP95(summary) {
  return summary.renderFrame?.p95 ?? summary.renderFrame?.avg ?? null;
}

const baselineBuild = await readJson('baseline-build.json');
const currentBuild = await readJson('build.json');
const baselineBrowser = await readJson(`baseline-browser-${datasetName}.json`);
const currentBrowser = await readJson(`browser-${datasetName}.json`);

const beforeSummary = baselineBrowser.summary;
const afterSummary = currentBrowser.summary;

const html = pageShell({
  title: `Mind Palace Performance Comparison (${datasetName})`,
  subtitle: `Generated: ${new Date().toISOString()}`,
  body: `
    <div class="links">
      <a href="./index.html">报告首页</a>
      <a href="./build.html">当前构建报告</a>
      <a href="./browser-${escapeHtml(datasetName)}.html">当前浏览器报告</a>
      <a href="./baseline-browser-${escapeHtml(datasetName)}.json">Baseline JSON</a>
      <a href="./browser-${escapeHtml(datasetName)}.json">Current JSON</a>
    </div>

    <section class="section grid">
      <div class="card">
        <div class="metric-label">App init</div>
        <div class="metric-value">${formatMs(beforeSummary.appInit)} -> ${formatMs(afterSummary.appInit)}</div>
      </div>
      <div class="card">
        <div class="metric-label">Render frame p95</div>
        <div class="metric-value">${formatMs(renderFrameP95(beforeSummary))} -> ${formatMs(renderFrameP95(afterSummary))}</div>
      </div>
      <div class="card">
        <div class="metric-label">JS gzip</div>
        <div class="metric-value">${formatBytes(baselineBuild.totals.jsGzipBytes)} -> ${formatBytes(currentBuild.totals.jsGzipBytes)}</div>
      </div>
      <div class="card">
        <div class="metric-label">Budget</div>
        <div class="metric-value">${statusBadge(currentBrowser.budgetStatus.appInit)} ${statusBadge(currentBrowser.budgetStatus.renderFrameP95)}</div>
      </div>
    </section>

    <section class="section">
      <h2>Browser Metrics</h2>
      <table>
        <thead><tr><th>Metric</th><th class="number">Before</th><th class="number">After</th><th>Change</th></tr></thead>
        <tbody>
          ${row('Browser load duration', beforeSummary.browserLoadDurationMs, afterSummary.browserLoadDurationMs)}
          ${row('App init', beforeSummary.appInit, afterSummary.appInit)}
          ${row('Storage init', beforeSummary.storageInit, afterSummary.storageInit)}
          ${row('Storage fetch', beforeSummary.storageFetch, afterSummary.storageFetch)}
          ${row('Layout signature avg', beforeSummary.layoutSignature?.avg, afterSummary.layoutSignature?.avg)}
          ${row('Build sim nodes avg', beforeSummary.buildSimNodes?.avg, afterSummary.buildSimNodes?.avg)}
          ${row('Render frame p95', renderFrameP95(beforeSummary), renderFrameP95(afterSummary))}
          ${countRow('Render frames', beforeSummary.renderFrameCount, afterSummary.renderFrameCount)}
          ${countRow('Long tasks', beforeSummary.longTasks, afterSummary.longTasks)}
          ${countRow('DOM elements', baselineBrowser.collected.dom.elements, currentBrowser.collected.dom.elements)}
          ${countRow('SVG elements', baselineBrowser.collected.dom.svgElements, currentBrowser.collected.dom.svgElements)}
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Build Metrics</h2>
      <table>
        <thead><tr><th>Metric</th><th class="number">Before</th><th class="number">After</th><th>Change</th></tr></thead>
        <tbody>
          ${row('Build duration', baselineBuild.buildDurationMs, currentBuild.buildDurationMs)}
          ${row('JS gzip', baselineBuild.totals.jsGzipBytes, currentBuild.totals.jsGzipBytes, formatBytes)}
          ${row('CSS gzip', baselineBuild.totals.cssGzipBytes, currentBuild.totals.cssGzipBytes, formatBytes)}
          ${row('All assets gzip', baselineBuild.totals.gzipBytes, currentBuild.totals.gzipBytes, formatBytes)}
        </tbody>
      </table>
    </section>
  `,
});

const htmlPath = path.join(reportsDir, `comparison-${datasetName}.html`);
await fs.writeFile(htmlPath, html, 'utf8');
console.log(`Comparison report written to ${path.relative(root, htmlPath)}`);
