import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

// Read the version from package.json without a JSON import assertion (that
// syntax varies across Node versions). Bump the version once and the sidebar
// footer updates on the next build — no hardcoding.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
})
