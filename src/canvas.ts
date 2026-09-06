import { Hono } from 'hono';
import clientJs from '../dist/client.js?raw';
import defaultHtml from './client/default.html?raw';

// Canvas ids are caller-chosen URL slugs; anything that isn't one is not a
// canvas (keeps /favicon.ico & co from rendering a seed page).
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * The editor chrome injected into every served canvas page: the chat bar,
 * its styles, the canvas id bootstrap, and the client bundle (the thin
 * `@flue/sdk` glue in `src/client/index.ts`).
 *
 * Because injection happens on every read, the chat bar survives whatever
 * the agent rewrites — the stored HTML is pure content.
 */
function chrome(id: string): string {
	return `
<div id="fc-shell" style="all:initial;position:fixed;left:0;right:0;bottom:0;z-index:2147483647;font-family:ui-sans-serif,system-ui,sans-serif">
<style>
#fc-shell{color-scheme:dark}
#fc-shell .fc-bar{display:flex;gap:8px;align-items:center;max-width:640px;margin:0 auto 12px;padding:10px 12px;background:rgba(17,20,26,.92);border:1px solid #2a303c;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.4);backdrop-filter:blur(6px)}
#fc-shell textarea{flex:1;resize:none;border:1px solid #333b49;background:#0e1116;color:#e6e6e6;border-radius:8px;padding:8px 10px;font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;min-height:38px;max-height:120px}
#fc-shell textarea:focus{outline:none;border-color:#5c7cfa}
#fc-shell textarea:disabled{opacity:.6}
#fc-shell button{border:0;border-radius:8px;background:#5c7cfa;color:#fff;font:600 13px/1 ui-sans-serif,system-ui,sans-serif;padding:11px 14px;cursor:pointer;white-space:nowrap}
#fc-shell button:disabled{background:#3b4252;cursor:default}
#fc-shell .fc-status{max-width:640px;margin:0 auto 6px;padding:0 6px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8ce99a;min-height:1em;text-align:right}
</style>
<div class="fc-status" id="fc-status"></div>
<div class="fc-bar">
  <textarea id="fc-prompt" rows="1" placeholder="Ask the assistant to change this page…"></textarea>
  <button id="fc-send" type="button">Send</button>
</div>
</div>
<script>window.__CANVAS_ID__=${JSON.stringify(id)};</script>
<script>${clientJs}</script>`;
}

/** Inject the editor chrome into an HTML document (before </body>, or at the end). */
function withChrome(html: string, id: string): string {
	const injected = chrome(id);
	const match = /<\/body>/i.exec(html);
	if (match && match.index !== undefined) {
		return html.slice(0, match.index) + injected + html.slice(match.index);
	}
	return html + injected;
}

/**
 * The canvas page routes (mounted at /canvas in app.ts):
 *   GET    /canvas/<id> — serve the stored HTML for that id (the starter page
 *                         until the agent saves its first edit), with the
 *                         editor chrome injected.
 *   DELETE /canvas/<id> — remove the canvas artifact from R2.
 * The raw document is what the agent edits and persists to R2 — the chrome is
 * only ever part of the served response.
 */
export function createCanvasApp(bucketName: string): Hono {
	const app = new Hono();

	const bucketOf = (c: { env: unknown }): R2Bucket | undefined =>
		(c.env as Record<string, R2Bucket | undefined>)[bucketName];

	app.get('/:id', async (c) => {
		const id = c.req.param('id') ?? '';
		if (!SAFE_ID.test(id)) return c.notFound();

		const bucket = bucketOf(c);
		let html: string;
		const object = bucket ? await bucket.get(id) : null;
		html = object ? await object.text() : defaultHtml;

		return c.html(withChrome(html, id));
	});

	app.delete('/:id', async (c) => {
		const id = c.req.param('id') ?? '';
		if (!SAFE_ID.test(id)) return c.notFound();

		const bucket = bucketOf(c);
		if (bucket) await bucket.delete(id);
		// The page artifact is gone. The agent conversation for this id is
		// durable DO state Flue does not expose for deletion — it only
		// resurfaces if the same id is deliberately reused.
		return c.body(null, 204);
	});

	return app;
}
