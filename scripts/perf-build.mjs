import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { escapeHtml, formatBytes, pageShell, statusBadge } from './lib/perf-report-html.mjs';

const root = process.cwd();
const perfDir = path.join(root, '.perf');
const reportsDir = path.join(perfDir, 'reports');
const distDir = path.join(root, 'dist');
const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function run(command, args) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      const durationMs = performance.now() - start;
      if (code === 0) resolve({ durationMs });
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

async function gzipSize(file) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const stream = createReadStream(file).pipe(zlib.createGzip());
    stream.on('data', (chunk) => {
      size += chunk.length;
    });
    stream.on('end', () => resolve(size));
    stream.on('error', reject);
  });
}

async function collectAssets(dir) {
  const assets = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      const stat = await fs.stat(file);
      assets.push({
        file: path.relative(root, file).replaceAll(path.sep, '/'),
        bytes: stat.size,
        gzipBytes: await gzipSize(file),
        ext: path.extname(file),
      });
    }
  }
  await walk(dir);
  return assets.sort((a, b) => b.bytes - a.bytes);
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

await fs.mkdir(reportsDir, { recursive: true });
const typecheck = await run(process.execPath, [tscBin, '-b']);
const vite = await run(process.execPath, [viteBin, 'build']);
const build = { durationMs: typecheck.durationMs + vite.durationMs };
const assets = await collectAssets(distDir);
const totals = assets.reduce(
  (acc, asset) => ({
    bytes: acc.bytes + asset.bytes,
    gzipBytes: acc.gzipBytes + asset.gzipBytes,
    jsBytes: acc.jsBytes + (asset.ext === '.js' ? asset.bytes : 0),
    jsGzipBytes: acc.jsGzipBytes + (asset.ext === '.js' ? asset.gzipBytes : 0),
    cssBytes: acc.cssBytes + (asset.ext === '.css' ? asset.bytes : 0),
    cssGzipBytes: acc.cssGzipBytes + (asset.ext === '.css' ? asset.gzipBytes : 0),
  }),
  { bytes: 0, gzipBytes: 0, jsBytes: 0, jsGzipBytes: 0, cssBytes: 0, cssGzipBytes: 0 },
);

const budgets = {
  jsGzipBytes: 150 * 1024,
};

const report = {
  generatedAt: new Date().toISOString(),
  buildDurationMs: Math.round(build.durationMs),
  budgets,
  budgetStatus: {
    jsGzip: totals.jsGzipBytes <= budgets.jsGzipBytes ? 'pass' : 'fail',
  },
  totals,
  assets,
};

const jsonPath = path.join(reportsDir, 'build.json');
const mdPath = path.join(reportsDir, 'build.md');
const htmlPath = path.join(reportsDir, 'build.html');
await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.writeFile(
  mdPath,
  [
    '# Mind Palace Build Performance',
    '',
    `Generated: ${report.generatedAt}`,
    `Build duration: ${report.buildDurationMs} ms`,
    '',
    '## Totals',
    '',
    `- JS: ${formatKb(totals.jsBytes)} / gzip ${formatKb(totals.jsGzipBytes)} (${report.budgetStatus.jsGzip})`,
    `- CSS: ${formatKb(totals.cssBytes)} / gzip ${formatKb(totals.cssGzipBytes)}`,
    `- All assets: ${formatKb(totals.bytes)} / gzip ${formatKb(totals.gzipBytes)}`,
    '',
    '## Largest Assets',
    '',
    '| File | Size | Gzip |',
    '| --- | ---: | ---: |',
    ...assets.slice(0, 10).map((asset) => `| ${asset.file} | ${formatKb(asset.bytes)} | ${formatKb(asset.gzipBytes)} |`),
    '',
  ].join('\n'),
  'utf8',
);
await fs.writeFile(
  htmlPath,
  pageShell({
    title: 'Mind Palace Build Performance',
    subtitle: `Generated: ${report.generatedAt}`,
    body: `
      <div class="links">
        <a href="./index.html">报告首页</a>
        <a href="./build.json">原始 JSON</a>
        <a href="./build.md">Markdown</a>
      </div>
      <section class="section grid">
        <div class="card"><div class="metric-label">Build duration</div><div class="metric-value">${report.buildDurationMs} ms</div></div>
        <div class="card"><div class="metric-label">JS gzip</div><div class="metric-value">${formatBytes(totals.jsGzipBytes)} ${statusBadge(report.budgetStatus.jsGzip)}</div></div>
        <div class="card"><div class="metric-label">CSS gzip</div><div class="metric-value">${formatBytes(totals.cssGzipBytes)}</div></div>
        <div class="card"><div class="metric-label">All gzip</div><div class="metric-value">${formatBytes(totals.gzipBytes)}</div></div>
      </section>
      <section class="section">
        <h2>Largest Assets</h2>
        <table>
          <thead><tr><th>File</th><th class="number">Size</th><th class="number">Gzip</th></tr></thead>
          <tbody>
            ${assets.slice(0, 20).map((asset) => `
              <tr>
                <td>${escapeHtml(asset.file)}</td>
                <td class="number">${formatBytes(asset.bytes)}</td>
                <td class="number">${formatBytes(asset.gzipBytes)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    `,
  }),
  'utf8',
);

console.log(`Build performance report written to ${path.relative(root, mdPath)}`);
