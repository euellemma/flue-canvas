import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/cli.ts',
    outDir: 'dist',
    emptyOutDir: false,
    target: 'node22',
    rollupOptions: {
      external: [
        /^node:/,
        'node:child_process',
        'node:crypto',
        'node:fs',
        'node:path',
        'node:readline',
      ],
      output: {
        entryFileNames: 'cli.mjs',
        format: 'es',
      },
    },
  },
});
