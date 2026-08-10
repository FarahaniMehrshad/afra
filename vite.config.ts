import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Resolve `@/` to the `src/` folder alongside this config file. Using
// `import.meta.url` avoids depending on `@types/node`.
const srcDir = new URL('./src/', import.meta.url).pathname;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': srcDir.replace(/\/$/, ''),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
