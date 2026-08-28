import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleMindPalaceApi } from './apiHandler.ts';
import { DATA_FILE } from './paths.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const seedPath = path.join(root, 'data/seed.json');
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '0.0.0.0';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(distDir, pathname));
  if (!filePath.startsWith(distDir)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    const fallback = path.join(distDir, 'index.html');
    if (existsSync(fallback)) {
      const html = await readFile(fallback);
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME['.html']);
      res.end(html);
      return;
    }
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const body = await readFile(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  res.end(body);
}

createServer(async (req, res) => {
  const handled = await handleMindPalaceApi(req, res, seedPath);
  if (handled) return;
  await serveStatic(req, res);
}).listen(port, host, () => {
  console.log(`Mind Palace server running at http://${host}:${port}`);
  console.log(`Data file: ${DATA_FILE}`);
});
