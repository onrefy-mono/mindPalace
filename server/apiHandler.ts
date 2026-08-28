import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readMindPalaceData,
  resetMindPalaceData,
  writeMindPalaceData,
} from './dataService.ts';
import { DATA_FILE } from './paths.ts';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

function normalizeRemoteAddress(address: string | undefined): string {
  if (!address) return '';
  if (address.startsWith('::ffff:')) return address.slice('::ffff:'.length);
  return address;
}

function isLocalRequest(req: IncomingMessage): boolean {
  const remoteAddress = normalizeRemoteAddress(req.socket.remoteAddress);
  return remoteAddress === '::1' || remoteAddress === '127.0.0.1';
}

export async function handleMindPalaceApi(
  req: IncomingMessage,
  res: ServerResponse,
  seedPath: string,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const canWrite = isLocalRequest(req);

  if (url.pathname === '/api/access' && method === 'GET') {
    sendJson(res, 200, {
      canWrite,
      readOnly: !canWrite,
    });
    return true;
  }

  if (url.pathname === '/api/data' && method === 'GET') {
    try {
      const data = await readMindPalaceData(seedPath);
      sendJson(res, 200, data);
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'Failed to read data');
    }
    return true;
  }

  if (url.pathname === '/api/data' && method === 'PUT') {
    if (!canWrite) {
      sendError(res, 403, '当前访问为只读模式，请从本机 localhost/127.0.0.1 访问后编辑');
      return true;
    }
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw) as unknown;
      await writeMindPalaceData(data);
      sendJson(res, 200, { ok: true, path: DATA_FILE });
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'Failed to save data');
    }
    return true;
  }

  if (url.pathname === '/api/data/reset' && method === 'POST') {
    if (!canWrite) {
      sendError(res, 403, '当前访问为只读模式，请从本机 localhost/127.0.0.1 访问后编辑');
      return true;
    }
    try {
      const data = await resetMindPalaceData(seedPath);
      sendJson(res, 200, data);
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'Failed to reset data');
    }
    return true;
  }

  if (url.pathname === '/api/storage/info' && method === 'GET') {
    sendJson(res, 200, { path: DATA_FILE });
    return true;
  }

  return false;
}
