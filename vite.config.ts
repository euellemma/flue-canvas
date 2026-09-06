import { cloudflare } from '@cloudflare/vite-plugin';
import { flue, flueWorkerConfig } from '@flue/vite';
import { defineConfig } from 'vite';

// The Flue server config (default `vite dev` / `vite build`). flue() must
// come first: the Cloudflare plugin invokes flueWorkerConfig() — Flue's
// worker-config customizer, contributing the generated Worker entry and the
// per-agent Durable Object binding — while Vite resolves this config.
export default defineConfig({
	plugins: [flue(), cloudflare({ config: flueWorkerConfig() })],
});
