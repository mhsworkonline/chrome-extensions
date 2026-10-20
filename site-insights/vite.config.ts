import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
  resolve: {
    // Optional jsPDF extras this extension doesn't use; see src/stubs/empty.ts.
    alias: {
      html2canvas: resolve(import.meta.dirname, 'src/stubs/empty.ts'),
      canvg: resolve(import.meta.dirname, 'src/stubs/empty.ts'),
      dompurify: resolve(import.meta.dirname, 'src/stubs/empty.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        panel: resolve(import.meta.dirname, 'panel.html'),
        worker: resolve(import.meta.dirname, 'src/worker/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
