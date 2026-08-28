import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const stagingDir = path.join(root, '.electron-app');

await fs.rm(stagingDir, { recursive: true, force: true });
await fs.mkdir(stagingDir, { recursive: true });

await fs.cp(path.join(root, 'dist'), path.join(stagingDir, 'dist'), { recursive: true });
await fs.cp(path.join(root, 'electron'), path.join(stagingDir, 'electron'), { recursive: true });
await fs.mkdir(path.join(stagingDir, 'data'), { recursive: true });
await fs.copyFile(
  path.join(root, 'data', 'seed.json'),
  path.join(stagingDir, 'data', 'seed.json'),
);

await fs.writeFile(
  path.join(stagingDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'mind-palace',
      version: '0.0.0',
      private: true,
      main: 'electron/main.cjs',
    },
    null,
    2,
  )}\n`,
  'utf-8',
);
