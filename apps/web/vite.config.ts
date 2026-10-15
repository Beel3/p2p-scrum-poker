import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// В разработке Vite поднимается на 5173 и проксирует API/WS на сервер (3000).
// В продакшене сервер отдаёт собранный бандл сам, прокси не нужно.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
      '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist',
  },
})
