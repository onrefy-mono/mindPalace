import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mindPalaceStoragePlugin } from './server/vitePlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), mindPalaceStoragePlugin()],
  server: {
    watch: {
      ignored: ['**/release/**', '**/.electron-app/**'],
    },
  },
  optimizeDeps: {
    include: ['d3'],
  },
})
