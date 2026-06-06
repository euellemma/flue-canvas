import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: false,
    lib: {
      entry: 'src/client/index.ts',
      formats: ['iife'],
      name: 'FlueCanvas',
      fileName: () => 'client.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2020',
  },
});
