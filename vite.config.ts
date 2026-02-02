import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'site',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      'playtest': resolve(__dirname, 'dist/index.js'),
    }
  }
})
