/**
 * The injected editor chrome for a canvas page. This is NOT a custom agent
 * client — it is a thin DOM wiring over the official `@flue/sdk`. The server
 * injects `window.__CANVAS_ID__` plus this bundle into every canvas page it
 * serves, so the chat bar always survives whatever the agent rewrites.
 */
import { createFlueClient } from '@flue/sdk';

const w = window as unknown as {
	__CANVAS_ID__?: string;
};

function el<T extends HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

async function main() {
	const canvasId = w.__CANVAS_ID__;
	if (!canvasId) return;

	const client = createFlueClient({
		url: `/agents/canvas/${encodeURIComponent(canvasId)}`,
	});

	const promptEl = el<HTMLTextAreaElement>('fc-prompt');
	const sendEl = el<HTMLButtonElement>('fc-send');
	const statusEl = el<HTMLElement>('fc-status');
	if (!promptEl || !sendEl) return;

	// Keep the draft across the reload that follows a successful edit.
	const draftKey = `fc:draft:${canvasId}`;
	promptEl.value = sessionStorage.getItem(draftKey) ?? promptEl.value ?? '';

	const setStatus = (text: string, isError = false) => {
		if (!statusEl) return;
		statusEl.textContent = text;
		statusEl.style.color = isError ? '#ff6b6b' : '#8ce99a';
	};
	const setBusy = (busy: boolean) => {
		sendEl.disabled = busy;
		sendEl.textContent = busy ? 'Working…' : 'Send';
		promptEl.disabled = busy;
	};

	const submit = async () => {
		const message = promptEl.value.trim();
		if (!message || sendEl.disabled) return;
		sessionStorage.setItem(draftKey, promptEl.value);
		setBusy(true);
		setStatus('Thinking…');
		try {
			// POST -> 202 admission, then wait for the turn to settle; the
			// agent's finish hook has already synced the new HTML to R2.
			const receipt = await client.send({ message: { kind: 'user', body: message } });
			await client.read(receipt);
			setStatus('Done — reloading…');
			sessionStorage.removeItem(draftKey);
			location.reload();
		} catch (error) {
			setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`, true);
			setBusy(false);
		}
	};

	sendEl.addEventListener('click', submit);
	promptEl.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void submit();
		}
	});
}

void main();
