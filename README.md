# flue-canvas

Live-edit HTML pages with an AI assistant, on Flue 2 (Cloudflare Workers).

Every canvas is a plain URL. Open `/canvas/<id>`, type a request in the bar at
the bottom, and an agent rewrites that very page in place. Each edit is persisted
against the id — the same address always shows the latest version. The root
page (`/`) is a small manager for listing, opening, and deleting canvases.

## How it works

- `GET /` — the manager: every canvas whose agent has saved an edit (R2 is the
  source of truth), newest first, titled from the page's `<title>` (stored as
  R2 metadata on save). Includes a *new random* helper and ✕ delete
  (`DELETE /canvas/<id>` removes the R2 artifact; the durable conversation
  isn't deletable via Flue's public API and only resurfaces if the id is
  deliberately reused — hence random ids for new canvases).
- `GET /canvas/<id>` serves the stored HTML from R2 (the starter page until the first
  edit) with a small editor chrome injected into the response.
- The chrome is a thin DOM wrapper over the official **`@flue/sdk`** client —
  no custom agent protocol. It talks to the agent conversation at
  `/agents/canvas/<id>`, waits for the turn to settle, then reloads.
- `src/agents/canvas-editor.ts` is the agent: one durable conversation per
  canvas id. On each turn it hydrates `/canvas.html` from R2
  (`useAgentStart`), the model edits the file with sandbox tools, and
  `useAgentFinish` persists it back to R2 only when it changed.
- There is no auth, no CLI, and no custom client — a canvas id IS the
  capability. (Anyone who guesses an id can prompt the agent against it.)

## Development

Requires a Cloudflare account (Workers AI binding runs remotely; local R2 is
emulated). Auth: `wrangler login`.

```bash
pnpm install
pnpm dev      # builds the client chrome, then vite dev (http://localhost:5173)
pnpm build    # client chrome + deployable Worker output
pnpm deploy   # build + wrangler deploy
```

Open http://localhost:5173/ to manage canvases, or /canvas/anything to create one.

## Key files

- [src/app.ts](./src/app.ts) — route map: manager + canvas pages + agent
  conversation router.
- [src/home.ts](./src/home.ts) — canvas manager (`GET /`), R2-backed list
  with titles, plus open/new/delete.
- [src/agents/canvas-editor.ts](./src/agents/canvas-editor.ts) — the canvas
  editing agent (hydration + R2 persistence hooks, `<title>` metadata).
- [src/canvas.ts](./src/canvas.ts) — page serving + chrome injection.
- [src/client/index.ts](./src/client/index.ts) — injected chrome: `@flue/sdk`
  glue for the chat bar.
- [src/client/default.html](./src/client/default.html) — starter page shown
  until the first edit is saved.
