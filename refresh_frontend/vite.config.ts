import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:3000'
const wsTarget = apiTarget.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../static_v2',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor'
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'query'
          }
          if (id.includes('node_modules/codemirror') || id.includes('node_modules/@codemirror') || id.includes('node_modules/@lezer')) {
            return 'editor'
          }
        },
      },
    },
  },
})
