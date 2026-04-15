import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // ── WebSocket ───────────────────────────────────────────────────────────────────
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
      // ── Authentication (local JWT + Google OAuth) ────────────────────────────
      // Must be listed BEFORE other routes to avoid prefix collisions.
      // Handles: /auth/login  /auth/me  /auth/logout  /auth/users
      //          /auth/login/google  /auth/callback/google  /auth/roles
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // ── All backend REST routes ───────────────────────────────────────────────
      // Catches: /run /stats /models /uploads /upload /reports
      //          /agents /tools /kb /fs-config /telegram /self-improver
      //          /web-search /spawns /tool-spawns /spawn-settings
      '/run':            { target: 'http://localhost:8000', changeOrigin: true },
      '/stats':          { target: 'http://localhost:8000', changeOrigin: true },
      '/models':         { target: 'http://localhost:8000', changeOrigin: true },
      '/uploads':        { target: 'http://localhost:8000', changeOrigin: true },
      '/upload':         { target: 'http://localhost:8000', changeOrigin: true },
      '/reports':        { target: 'http://localhost:8000', changeOrigin: true },
      '/agents':         { target: 'http://localhost:8000', changeOrigin: true },
      '/tools':          { target: 'http://localhost:8000', changeOrigin: true },
      '/tool-spawns':    { target: 'http://localhost:8000', changeOrigin: true },
      '/spawn-settings': { target: 'http://localhost:8000', changeOrigin: true },
      '/spawns':         { target: 'http://localhost:8000', changeOrigin: true },
      '/kb':             { target: 'http://localhost:8000', changeOrigin: true },
      '/fs-config':      { target: 'http://localhost:8000', changeOrigin: true },
      '/telegram':       { target: 'http://localhost:8000', changeOrigin: true },
      '/self-improver':  { target: 'http://localhost:8000', changeOrigin: true },
      '/web-search':     { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  define: {
    // Production API URL — override via VITE_API_URL env var at build time
    // e.g.  VITE_API_URL=https://api.yourdomain.com npm run build
    __API_URL__: JSON.stringify(
      process.env.VITE_API_URL || ''
    ),
  },
})
