const { app, BrowserWindow, Menu, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const seedPath = path.join(rootDir, 'data', 'seed.json');
const iconPath = fs.existsSync(path.join(distDir, 'app-icon.ico'))
  ? path.join(distDir, 'app-icon.ico')
  : path.join(rootDir, 'public', 'app-icon.ico');
const dataDir = path.join(os.homedir(), '.mindpalace');
const dataFile = process.env.MIND_PALACE_DATA_FILE
  ? path.resolve(process.env.MIND_PALACE_DATA_FILE)
  : path.join(dataDir, 'data.json');

let localServer = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Unable to resolve an available port'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function normalizeRemoteAddress(address) {
  if (!address) return '';
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}

function isLocalRequest(req) {
  const remoteAddress = normalizeRemoteAddress(req.socket.remoteAddress);
  return remoteAddress === '::1' || remoteAddress === '127.0.0.1';
}

async function ensureDataDir() {
  await fsp.mkdir(dataDir, { recursive: true });
}

async function readSeedData() {
  return JSON.parse(await fsp.readFile(seedPath, 'utf-8'));
}

async function writeMindPalaceData(data) {
  await ensureDataDir();
  await fsp.writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

async function readMindPalaceData() {
  await ensureDataDir();
  try {
    return JSON.parse(await fsp.readFile(dataFile, 'utf-8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const seed = await readSeedData();
    await writeMindPalaceData(seed);
    return seed;
  }
}

async function resetMindPalaceData() {
  const seed = await readSeedData();
  await writeMindPalaceData(seed);
  return seed;
}

async function handleApi(req, res) {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const canWrite = isLocalRequest(req);

  if (url.pathname === '/api/access' && method === 'GET') {
    sendJson(res, 200, { canWrite, readOnly: !canWrite });
    return true;
  }

  if (url.pathname === '/api/data' && method === 'GET') {
    try {
      sendJson(res, 200, await readMindPalaceData());
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
      await writeMindPalaceData(JSON.parse(await readBody(req)));
      sendJson(res, 200, { ok: true, path: dataFile });
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
      sendJson(res, 200, await resetMindPalaceData());
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'Failed to reset data');
    }
    return true;
  }

  if (url.pathname === '/api/storage/info' && method === 'GET') {
    sendJson(res, 200, { path: dataFile });
    return true;
  }

  return false;
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname.endsWith('/')) pathname = path.join(pathname, 'index.html');

  const filePath = path.normalize(path.join(distDir, pathname));
  if (!filePath.startsWith(distDir)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const target = fs.existsSync(filePath) ? filePath : path.join(distDir, 'index.html');
  if (!fs.existsSync(target)) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  const ext = path.extname(target);
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  res.end(await fsp.readFile(target));
}

async function startLocalServer() {
  if (localServer) return localServer.url;
  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  const server = http.createServer(async (req, res) => {
    try {
      if (await handleApi(req, res)) return;
      await serveStatic(req, res);
    } catch (error) {
      sendError(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  localServer = { server, url };
  return url;
}

async function createWindow() {
  const rendererUrl = process.env.MIND_PALACE_ELECTRON_URL || await startLocalServer();
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#020617',
    title: 'Mind Palace',
    icon: iconPath,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#020617',
      symbolColor: '#cbd5e1',
      height: 32,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL(rendererUrl);
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);

  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (localServer) {
    localServer.server.close();
    localServer = null;
  }
});
