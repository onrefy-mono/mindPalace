export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function formatMs(value) {
  return typeof value === 'number' ? `${(Math.round(value * 100) / 100).toFixed(2)} ms` : 'n/a';
}

export function statusBadge(status) {
  const normalized = status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'neutral';
  return `<span class="badge ${normalized}">${escapeHtml(status ?? 'n/a')}</span>`;
}

export function pageShell({ title, subtitle = '', body }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: #121a2d;
      --panel-2: #18233a;
      --text: #e5edf8;
      --muted: #8fa1bb;
      --line: rgba(148, 163, 184, 0.22);
      --good: #22c55e;
      --bad: #ef4444;
      --warn: #f59e0b;
      --blue: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    header {
      padding: 28px 32px 18px;
      border-bottom: 1px solid var(--line);
      background: #0f172a;
    }
    main { padding: 24px 32px 40px; max-width: 1180px; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 17px; }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .subtitle { margin-top: 6px; color: var(--muted); font-size: 13px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 14px;
    }
    .metric-label { color: var(--muted); font-size: 12px; }
    .metric-value { margin-top: 4px; font-size: 22px; font-weight: 700; }
    .section { margin-top: 20px; }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      font-size: 13px;
    }
    th { color: var(--muted); background: var(--panel-2); font-weight: 600; }
    tr:last-child td { border-bottom: 0; }
    .number { text-align: right; font-variant-numeric: tabular-nums; }
    .badge {
      display: inline-flex;
      align-items: center;
      min-width: 48px;
      justify-content: center;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge.pass { color: #dcfce7; background: rgba(34, 197, 94, 0.18); border: 1px solid rgba(34, 197, 94, 0.35); }
    .badge.fail { color: #fee2e2; background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(239, 68, 68, 0.35); }
    .badge.neutral { color: #e2e8f0; background: rgba(148, 163, 184, 0.14); border: 1px solid rgba(148, 163, 184, 0.28); }
    .links { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
    .small { color: var(--muted); font-size: 12px; }
    code { color: #bae6fd; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
  </header>
  <main>
    ${body}
  </main>
</body>
</html>`;
}
