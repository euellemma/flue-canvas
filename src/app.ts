import { Hono } from "hono";
import { flue } from "@flue/runtime/routing";
import { auth, canvas } from "./canvas";

const app = new Hono();

// Shared HMAC auth — SIGNING_KEY set via wrangler secret put SIGNING_KEY
const authorize = auth((c) => (c.env as Record<string, string>).SIGNING_KEY);

app.use("/canvas/*", authorize);
app.use("/workflows/*", authorize);
app.route("/canvas", canvas("CANVAS_BUCKET"));
app.route("/", flue());

export default app;
