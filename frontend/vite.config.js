import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/login': 'http://localhost:8000',
      '/auth': 'http://localhost:8000',
      '/alerts': 'http://localhost:8000',
      '/audit-logs': 'http://localhost:8000',
      '/employees': 'http://localhost:8000',
      '/settings': 'http://localhost:8000',
      '/attendance': 'http://localhost:8000',
      '/status': 'http://localhost:8000',
      '/cameras': 'http://localhost:8000',
      '/snapshots': 'http://localhost:8000',
      '/video_feed': 'http://localhost:8000',
      '/users': 'http://localhost:8000',
    }
  }
})
