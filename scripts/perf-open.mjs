import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, '.perf', 'reports', 'index.html');

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function openFile(file) {
  if (process.platform === 'win32') {
    return spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Process', file], {
      detached: true,
      stdio: 'ignore',
    });
  }
  if (process.platform === 'darwin') {
    return spawn('open', [file], {
      detached: true,
      stdio: 'ignore',
    });
  }
  return spawn('xdg-open', [file], {
    detached: true,
    stdio: 'ignore',
  });
}

if (!(await exists(reportPath))) {
  console.error(`Performance report not found: ${reportPath}`);
  console.error('Run "npm run perf" first.');
  process.exit(1);
}

const child = openFile(reportPath);
child.unref();
console.log(`Opened performance report: ${reportPath}`);
