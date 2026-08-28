import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mindPalaceStoragePlugin } from './server/vitePlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), mindPalaceStoragePlugin()],
  optimizeDeps: {
    include: ['d3'],
  },
})
