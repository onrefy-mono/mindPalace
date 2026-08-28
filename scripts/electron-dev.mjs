import { spawn } from 'node:child_process';

const rendererUrl = 'http://127.0.0.1:5173';
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';

const vite = spawn(
  npmCommand,
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
  {
    stdio: 'inherit',
    shell: false,
  },
);

let electron = null;
let shuttingDown = false;

async function waitForVite(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${rendererUrl}/api/access`);
      if (res.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite at ${rendererUrl}`);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electron && !electron.killed) electron.kill();
  if (!vite.killed) vite.kill();
  process.exit(code);
}

vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  await waitForVite();
  electron = spawn(
    npmCommand,
    ['exec', '--', 'electron', 'electron/main.cjs'],
    {
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        MIND_PALACE_ELECTRON_URL: rendererUrl,
      },
    },
  );
  electron.on('exit', (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}
