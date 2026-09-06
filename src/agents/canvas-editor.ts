'use agent';
import { env } from 'cloudflare:workers';
import { Bash, InMemoryFs } from 'just-bash';
import {
	bash,
	useAgentFinish,
	useAgentStart,
	useModel,
	usePersistentState,
	useSandbox,
	type AgentProps,
} from '@flue/runtime';
import defaultHtml from '../client/default.html?raw';

interface CanvasEnv {
	CANVAS_BUCKET: R2Bucket;
}

/**
 * The canvas editor. One durable conversation per canvas id (the `/<id>`
 * URL path becomes the conversation URL `/agents/canvas/<id>`), so every
 * conversation's state — including the mirror we keep of the saved HTML — is
 * persisted with the id automatically by the Flue runtime.
 *
 * R2 (keyed by the same id) remains the externally readable store: the page
 * route `GET /<id>` serves it, and this agent is the ONLY writer. Each turn:
 *
 *   1. useAgentStart — hydrate /canvas.html in the sandbox from R2 (seeding
 *      the starter page on first visit).
 *   2. The model reads/edits the file with the sandbox file tools.
 *   3. useAgentFinish — diff the file against what we hydrated; persist to
 *      R2 only when it changed.
 */
export function CanvasEditor(props: AgentProps) {
	const canvasId = props.id;
	// Workers AI binding (wrangler `ai`), so no provider API key is needed.
	useModel('cloudflare/@cf/google/gemma-4-26b-a4b-it');
	// Lightweight in-memory shell/filesystem — one file per turn is all we
	// need, durability comes from R2 + the mirror below.
	useSandbox(bash(() => new Bash({ fs: new InMemoryFs() })));

	// Durable mirror of the last HTML saved for this conversation id.
	const [saved, setSaved] = usePersistentState<string>('canvasHtml', '');

	useAgentStart(async ({ harness, log }) => {
		const bucket = (env as unknown as CanvasEnv).CANVAS_BUCKET;
		const object = await bucket.get(canvasId);
		const html = object ? await object.text() : defaultHtml;
		await harness.sandbox.writeFile('/canvas.html', html);
		setSaved(html);
		log.info('canvas loaded', { id: canvasId, bytes: html.length });
	});

	useAgentFinish(async ({ harness, log }) => {
		const next = await harness.sandbox.readFile('/canvas.html');
		if (next !== saved) {
			const bucket = (env as unknown as CanvasEnv).CANVAS_BUCKET;
			await bucket.put(canvasId, next);
			setSaved(next);
			log.info('canvas saved', { id: canvasId, bytes: next.length });
		}
	});

	return [
		'You are an assistant whose only channel to the user is /canvas.html, a complete standalone HTML document the user is watching live in their browser.',
		'You never chat with the user: your text replies are invisible to them. The ONLY thing the user ever sees is the page — so every request, including questions, must be handled by editing the document (answer a question by writing the answer into the page).',
		'Read /canvas.html before changing anything, then edit it to satisfy the request. Keep the document complete, valid and self-contained (inline CSS/JS only); make focused changes and leave the rest untouched.',
	].join('\n');
}
