import { Hono } from 'hono';
import { SAFE_ID } from './canvas.ts';

interface ListedCanvas {
	id: string;
	title: string;
	updated: Date | null;
}

/** Escapes untrusted text (canvas titles come from agent-edited HTML). */
function esc(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function relativeTime(date: Date): string {
	const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return date.toISOString().slice(0, 10);
}

async function listCanvases(bucket: R2Bucket): Promise<ListedCanvas[]> {
	const canvases: ListedCanvas[] = [];
	let cursor: string | undefined;
	do {
		const listing = await bucket.list({ cursor, limit: 1000 });
		for (const object of listing.objects) {
			if (!SAFE_ID.test(object.key)) continue; // only canvas artifacts live here
			canvases.push({ id: object.key, title: '', updated: null });
		}
		cursor = listing.truncated ? listing.cursor : undefined;
	} while (cursor);

	// Cheap per-canvas metadata (uploaded + customMetadata.title) — no bodies.
	await Promise.all(
		canvases.map(async (canvas) => {
			try {
				const head = await bucket.head(canvas.id);
				canvas.updated = head?.uploaded ?? null;
				canvas.title = head?.customMetadata?.title?.trim() ?? '';
			} catch {
				// leave title empty / updated null; the row still links
			}
		}),
	);
	return canvases.sort((a, b) => (b.updated?.getTime() ?? 0) - (a.updated?.getTime() ?? 0));
}

/**
 * The canvas manager (mounted at / in app.ts): server-rendered list of every
 * canvas (R2 is the source of truth — a canvas exists once the agent has
 * saved an edit), with open / new / delete affordances. The only client JS
 * is the delete fetch and the id box.
 */
export function createHomeApp(bucketName: string): Hono {
	const app = new Hono();

	app.get('/', async (c) => {
		const bucket = (c.env as Record<string, R2Bucket | undefined>)[bucketName];
		const canvases = bucket ? await listCanvases(bucket) : [];

		const rows = canvases
			.map((canvas) => {
				const meta = canvas.updated ? ` · edited ${relativeTime(canvas.updated)}` : '';
				return `
		<li class="row" data-id="${esc(canvas.id)}">
			<a class="open" href="/canvas/${encodeURIComponent(canvas.id)}">
				<span class="title">${esc(canvas.title || canvas.id)}</span>
				<span class="id">${esc(canvas.id)}${esc(meta)}</span>
			</a>
			<button class="delete" data-id="${esc(canvas.id)}" title="Delete canvas">✕</button>
		</li>`;
			})
			.join('');

		return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>flue-canvas</title>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;background:#0e1116;color:#e6e6e6}
main{max-width:720px;margin:0 auto;padding:2.5rem 1.5rem}
h1{font-size:1.5rem;margin:0 0 0.25rem}
.sub{color:#9aa3af;margin:0 0 2rem}
.box{display:flex;gap:8px;margin-bottom:2rem}
input{flex:1;border:1px solid #333b49;background:#0e1116;color:#e6e6e6;border-radius:8px;padding:9px 11px;font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
input:focus{outline:none;border-color:#5c7cfa}
button{border:0;border-radius:8px;background:#5c7cfa;color:#fff;font:600 13px/1 ui-sans-serif,system-ui,sans-serif;padding:11px 14px;cursor:pointer}
button.ghost{background:#2a303c;color:#c9d1d9}
button.delete{background:none;color:#565f6e;padding:6px 8px;font-size:13px}
button.delete:hover{color:#ff6b6b}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
li.row{display:flex;align-items:center;gap:8px;border:1px solid #232a35;border-radius:10px;padding:8px 12px;background:#11151c}
li.row:hover{border-color:#333b49}
a.open{flex:1;display:flex;flex-direction:column;gap:2px;text-decoration:none;color:inherit;min-width:0}
a.open .title{font-weight:600;color:#e6e6e6}
a.open .id{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b949e}
.empty{color:#565f6e;text-align:center;padding:3rem 0}
</style>
</head>
<body>
<main>
<h1>Canvases</h1>
<p class="sub">Open one, or type a new id to create it.</p>
<form class="box" id="open-form">
<input id="canvas-id" placeholder="canvas id… e.g. demo" autocomplete="off" />
<button type="submit">Open</button>
<button type="button" class="ghost" id="new-btn">New random</button>
</form>
<ul id="list">
${rows || '<li class="empty">No canvases yet — create one above.</li>'}
</ul>
</main>
<script>
const openForm = document.getElementById('open-form');
const idInput = document.getElementById('canvas-id');
openForm.addEventListener('submit', (e) => {
	e.preventDefault();
	const id = idInput.value.trim();
	if (id) location.href = '/canvas/' + encodeURIComponent(id);
});
document.getElementById('new-btn').addEventListener('click', () => {
	// Fresh random id so new canvases never collide with deleted ones.
	const id = crypto.randomUUID().split('-')[0];
	location.href = '/canvas/' + id;
});
document.querySelectorAll('button.delete').forEach((btn) => {
	btn.addEventListener('click', async () => {
		const id = btn.dataset.id;
		if (!id || !confirm('Delete canvas "' + id + '"? The page and its edits are removed.')) return;
		const res = await fetch('/canvas/' + encodeURIComponent(id), { method: 'DELETE' });
		if (res.ok) location.reload();
		else alert('Delete failed (' + res.status + ')');
	});
});
</script>
</body>
</html>`);
	});

	return app;
}
