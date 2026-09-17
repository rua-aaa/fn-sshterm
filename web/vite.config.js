import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

const root = path.resolve(__dirname);
const projectRoot = path.resolve(root, '..');

export default defineConfig({
  root,
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    port: 5170,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:1070',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:1070',
        ws: true,
      },
    },
  },
  build: {
    outDir: path.resolve(projectRoot, 'web/dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
