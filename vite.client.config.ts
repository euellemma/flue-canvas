import { defineConfig } from 'vite';

// Builds the injected editor chrome (`src/client/index.ts`, a thin wrapper
// over @flue/sdk) into a single iife. The server imports it via `?raw` and
// inlines it into every served canvas page, so this must run before
// `vite dev` / `vite build`.
export default defineConfig({
	build: {
		ssr: false,
		lib: {
			entry: 'src/client/index.ts',
			formats: ['iife'],
			name: 'FlueCanvasClient',
			fileName: () => 'client.js',
		},
		outDir: 'dist',
		emptyOutDir: false,
		target: 'es2020',
	},
});
