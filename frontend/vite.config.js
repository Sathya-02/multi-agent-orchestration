import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to backend during development
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  define: {
    // API URL can be overridden at build time via VITE_API_URL env var
    // e.g. VITE_API_URL=https://api.yourdomain.com npm run build
    __API_URL__: JSON.stringify(
      process.env.VITE_API_URL || 'http://localhost:8000'
    ),
  },
})
