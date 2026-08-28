import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const MIND_PALACE_DIR = path.join(os.homedir(), '.mindpalace');
export const DATA_FILE = process.env.MIND_PALACE_DATA_FILE
  ? path.resolve(process.env.MIND_PALACE_DATA_FILE)
  : path.join(MIND_PALACE_DIR, 'data.json');

export async function ensureMindPalaceDir(): Promise<void> {
  await fs.mkdir(MIND_PALACE_DIR, { recursive: true });
}
