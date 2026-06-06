import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import clientJs from "../dist/client.js?raw";
import defaultHtml from "./client/default.html?raw";

async function injectCanvasGlobals(c: any, next: () => Promise<void>) {
  await next();

  const id = c.req.query("id");
  const token = c.req.query("token");
  if (!id || !token) return;

  const url = new URL(c.req.url);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${url.host}/workflows/canvas-turn?id=${id}&token=${token}`;

  const inject = `<script>window.__CANVAS_ID__=${JSON.stringify(id)};window.__CANVAS_WS__=${JSON.stringify(wsUrl)}</script><script>${clientJs}</script>`;

  const body = await c.res.text();
  c.res = new Response(
    body.replace("</body>", `${inject}</body>`),
    c.res,
  );
}

export function canvas(bucketName: string) {
  const app = new Hono();

  // GET /canvas?id=... — serve HTML with injected connection globals
  app.get("/", injectCanvasGlobals, async (c) => {
    const id = c.req.query("id");
    if (!id) return c.text("Missing id", 400);

    const bucket = c.env[bucketName] as R2Bucket;
    const object = await bucket.get(id);

    return c.html(!object ? defaultHtml : await object.text());
  });

  // POST /canvas/push?id=... — upload HTML
  app.post("/push", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.text("Missing id", 400);
    const bucket = c.env[bucketName] as R2Bucket;
    await bucket.put(id, await c.req.text());
    return c.text("OK");
  });

  return app;
}

/**
 * HMAC-based auth middleware.
 * Client computes token = HMAC-SHA256(key, id) and passes both as query params.
 *
 * `key` may be a static string or a function receiving the Hono context,
 * so you can read it from `c.env.SECRET` on Cloudflare Workers.
 */
export function auth(key: string | ((c: Parameters<MiddlewareHandler>[0]) => string)): MiddlewareHandler {
  const resolve = typeof key === 'string' ? () => key : key;

  return async (c, next) => {
    const id = c.req.query('id');
    const token = c.req.query('token');
    if (!id || !token) return c.text('Missing id or token', 400);

    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw', enc.encode(resolve(c)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(id));
    const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

    if (!timingSafeEqual(token, expected)) return c.text('Unauthorized', 401);
    await next();
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

