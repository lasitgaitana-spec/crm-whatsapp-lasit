import { defineConfig } from 'vite'

// Proxy global para desarrollo: redirige tráficos a backend (3000)
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/tweb': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/wwebjs': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})