import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Splits heavy vendors into parallel chunks (kills the >500 kB warning).
        // NOTE: Vite 8 (Rolldown) only accepts the function form of manualChunks.
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('/react-dom/') || /node_modules\/react\//.test(id)) {
            return 'react';
          }
          if (id.includes('@reduxjs') || id.includes('/react-redux/')) {
            return 'redux';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          if (id.includes('hls.js')) {
            return 'audio';
          }
          if (id.includes('axios') || id.includes('fast-average-color')) {
            return 'data';
          }
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    // In development API calls are proxied to the backend (avoids CORS issues).
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
