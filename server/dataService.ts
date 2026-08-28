import fs from 'node:fs/promises';
import { DATA_FILE, ensureMindPalaceDir } from './paths.ts';

export async function readSeedData(seedPath: string): Promise<unknown> {
  const raw = await fs.readFile(seedPath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

export async function readMindPalaceData(seedPath: string): Promise<unknown> {
  await ensureMindPalaceDir();

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    const seed = await readSeedData(seedPath);
    await writeMindPalaceData(seed);
    return seed;
  }
}

export async function writeMindPalaceData(data: unknown): Promise<void> {
  await ensureMindPalaceDir();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export async function resetMindPalaceData(seedPath: string): Promise<unknown> {
  const seed = await readSeedData(seedPath);
  await writeMindPalaceData(seed);
  return seed;
}
