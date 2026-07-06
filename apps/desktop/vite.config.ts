import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const desktopRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: desktopRoot,
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(desktopRoot, 'index.html'),
    },
  },
});
