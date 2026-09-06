import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { CanvasEditor } from './agents/canvas-editor.ts';
import { createCanvasApp } from './canvas.ts';

/**
 * The route map. Flue mounts agent routers explicitly; this app exposes a
 * single agent — the canvas editor — plus the canvas page route.
 *
 *   GET  /agents/canvas/<id>            conversation stream read
 *   POST /agents/canvas/<id>            send an edit prompt (202 admission)
 *   GET  /canvas/<id>                   the canvas page (HTML from R2 + chrome)
 *
 * No auth (deliberate for now): a canvas id IS the capability.
 */
const app = new Hono();

app.route('/agents/canvas', createAgentRouter(CanvasEditor));
app.route('/canvas', createCanvasApp('CANVAS_BUCKET'));

export default app;
