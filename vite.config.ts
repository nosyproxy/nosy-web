import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.NOSY_UI ?? '127.0.0.1:1337'
// Token of a backend started with --token / beyond loopback (dev server only).
const token = process.env.NOSY_TOKEN
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: { __UI_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://${backend}`,
        ws: true,
        changeOrigin: true,
        // The backend only accepts same-origin writes; present ourselves as it.
        headers: { origin: `http://${backend}`, ...(token ? { 'x-nosy-token': token } : {}) },
      },
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 800,
  },
})
