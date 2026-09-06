# AGENTS.md

Live-edit HTML canvases served via Cloudflare Workers on Flue 2. A canvas is a
URL (`/canvas/<id>`) whose HTML is stored in R2 under that id; an agent
conversation (also keyed by id, mounted at `/agents/canvas/<id>`) edits it on
request. The served page always carries injected editor chrome (chat bar), so
the chrome survives whatever the agent rewrites — stored HTML is pure content.
The user never sees agent text replies; the page is the only channel.

## Key Files
- [src/app.ts](./src/app.ts): Route map. Mounts `createAgentRouter(CanvasEditor)`
  at `/agents/canvas`, the canvas page routes at `/canvas`, and the manager at `/`.
- [src/home.ts](./src/home.ts): Canvas manager (`GET /`) — R2-backed list of
  saved canvases (title from R2 customMetadata, uploaded timestamp), open / new
  random / delete (`DELETE /canvas/<id>`).
- [src/agents/canvas-editor.ts](./src/agents/canvas-editor.ts): The agent.
  `useAgentStart` hydrates `/canvas.html` in the sandbox from R2 (starter page
  on first visit); model edits with sandbox file tools; `useAgentFinish`
  persists to R2 when changed (storing the page `<title>` as metadata).
  `usePersistentState('canvasHtml')` mirrors the saved HTML durably with the
  conversation id.
- [src/canvas.ts](./src/canvas.ts): `GET /canvas/<id>` — serve R2 HTML (or the
  starter page) with the editor chrome injected; `DELETE /canvas/<id>` removes
  the artifact.
- [src/client/index.ts](./src/client/index.ts): Injected chrome — thin DOM
  wiring over the official `@flue/sdk` (createFlueClient), not a custom
  protocol. Built to `dist/client.js` and inlined into every canvas response.
- [src/client/default.html](./src/client/default.html): Starter page (seed)
  shown until the first edit is saved.

## Conventions
- No auth. A canvas id is the capability; editing routes are open.
- A canvas exists once the agent has saved an edit — R2 keys are the source of
  truth for the manager list; unedited (never-prompted) ids don't appear.
- Deleting a canvas removes the R2 artifact only; the durable conversation
  (Flue DO state) has no public delete route, so reuse of a deleted id
  resurrects the old conversation. New-canvas ids should be random.
- No CLI, no custom client, no tests by design.
- Client chrome must build before the server (`pnpm run build:client`); the
  server imports `../dist/client.js` via `?raw`.
- Cloudflare toolchain versions are pinned in package.json to a known-good
  combo (see the flue monorepo's pnpm-workspace allowlist for the release
  lockstep rationale) — bump plugin/wrangler/partyserver together.
