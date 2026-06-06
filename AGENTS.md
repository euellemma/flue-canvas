# AGENTS.md

A live-edit HTML system served via Cloudflare Workers. An HMAC-secured canvas app ([src/canvas.ts](./src/canvas.ts)) serves HTML and injects a WebSocket client ([src/client/index.ts](./src/client/index.ts)). The client connects back to the workflow ([src/workflows/canvas-turn.ts](./src/workflows/canvas-turn.ts)) which runs AI edit turns in a sandbox and writes updates back to R2.

## Key Files
- [src/app.ts](./src/app.ts): App entry mounting sub-apps.
- [src/canvas.ts](./src/canvas.ts): Canvas REST routes, injection middleware, and HMAC auth.
- [src/client/index.ts](./src/client/index.ts): Injected browser WebSocket client.
- [src/workflows/canvas-turn.ts](./src/workflows/canvas-turn.ts): Sandboxed AI edit execution and R2 synchronization.
- [src/cli.ts](./src/cli.ts): Push command-line helper.
- [tests/canvas.test.ts](./tests/canvas.test.ts): E2E test suite.

