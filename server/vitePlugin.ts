import path from 'node:path';
import type { Plugin } from 'vite';
import { handleMindPalaceApi } from './apiHandler.ts';

export function mindPalaceStoragePlugin(): Plugin {
  const seedPath = path.resolve(process.cwd(), 'data/seed.json');

  return {
    name: 'mind-palace-storage',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleMindPalaceApi(req, res, seedPath);
          if (!handled) next();
        } catch (error) {
          next(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
  };
}
