import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
        target: 'http://188.225.74.65:3011',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://188.225.74.65:3011',
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
