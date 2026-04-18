import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// LOKAL DEV — VITE_LOCAL=1 env bilan lokal backend'ga ulanadi
// aks holda production serverga (shonazar.uz) proxy qiladi
const LOCAL = process.env.VITE_LOCAL === '1';
const API_TARGET = LOCAL ? 'http://localhost:3001' : 'http://188.225.74.65:3011';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          xlsx: ['xlsx'],
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/igproxy': {
        target: 'https://graph.instagram.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/igproxy/, ''),
        secure: true,
      },
      '/igbizproxy': {
        target: 'https://graph.facebook.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/igbizproxy/, ''),
        secure: true,
      },
      '/lcuplogin': {
        target: 'https://yangiserver.lc-up.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lcuplogin/, ''),
        secure: true,
      },
      '/lcupapi': {
        target: 'https://data.lc-up.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lcupapi/, ''),
        secure: true,
      }
    }
  }
})
