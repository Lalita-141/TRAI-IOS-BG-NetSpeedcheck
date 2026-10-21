import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 3000,
    proxy: {
      '/v1': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/test-video': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/test-webpage': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
