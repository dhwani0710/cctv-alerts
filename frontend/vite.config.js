import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: 'http://localhost:8000', changeOrigin: true },
      '/employees': { target: 'http://localhost:8000', changeOrigin: true },
      '/settings': { target: 'http://localhost:8000', changeOrigin: true },
      '/attendance': { target: 'http://localhost:8000', changeOrigin: true },
      '/status': { target: 'http://localhost:8000', changeOrigin: true },
      '/cameras': { target: 'http://localhost:8000', changeOrigin: true },
      '/zones': { target: 'http://localhost:8000', changeOrigin: true },
      '/incidents': { target: 'http://localhost:8000', changeOrigin: true },
      '/snapshots': { target: 'http://localhost:8000', changeOrigin: true },
      '/video_feed': { target: 'http://localhost:8000', changeOrigin: true },
      '/users': { target: 'http://localhost:8000', changeOrigin: true },
      '/records': { target: 'http://localhost:8000', changeOrigin: true },
      '/api': 'http://localhost:8000',
      '/records': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
      '/employees': 'http://localhost:8000',
      '/settings': 'http://localhost:8000',
      '/attendance': 'http://localhost:8000',
      '/status': 'http://localhost:8000',
      '/cameras': 'http://localhost:8000',
      '/snapshots': 'http://localhost:8000',
      '/video_feed': 'http://localhost:8000',
      '/users': 'http://localhost:8000',
      '/login': 'http://localhost:8000',
    }
  }
})
