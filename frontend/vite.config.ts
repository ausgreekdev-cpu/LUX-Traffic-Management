import { defineConfig } from 'vite';
import { resolve } from 'path';
import checker from 'vite-plugin-checker';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    checker({
      typescript: true,
      eslint: {
        lintCommand: 'eslint . --ext .ts,.tsx',
      },
    }),
  ],
});
