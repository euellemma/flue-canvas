import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineCommand, runMain } from "citty";

const DEFAULT_SERVER = "http://localhost:3583";

function hmacHex(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

const pushCmd = defineCommand({
  meta: {
    name: "push",
    description: "Push an HTML file to a flue-canvas server or get the canvas URL",
  },
  args: {
    id: {
      type: "string",
      description: "Canvas id",
      required: true,
    },
    filePath: {
      type: "string",
      description: "Path to the HTML file (optional, skips push if omitted)",
      required: false,
    },
    server: {
      type: "string",
      description: "Canvas server URL",
      default: DEFAULT_SERVER,
      env: "SERVER",
    },
    key: {
      type: "string",
      description: "HMAC signing key (reads SIGNING_KEY env)",
      required: true,
      default: process.env.SIGNING_KEY,
    },
  },
  async run({ args }) {
    const token = hmacHex(args.key, args.id);
    const canvasUrl = `${args.server}/canvas?id=${encodeURIComponent(args.id)}&token=${encodeURIComponent(token)}`;

    if (args.filePath) {
      console.log(`Reading file: ${args.filePath}`);
      const content = readFileSync(args.filePath, "utf-8");

      const pushUrl = `${args.server}/canvas/push?id=${encodeURIComponent(args.id)}&token=${encodeURIComponent(token)}`;
      console.log(`Pushing to: ${pushUrl}`);

      const res = await fetch(pushUrl, { method: "POST", body: content });
      if (!res.ok) {
        console.error(`Push failed: HTTP ${res.status} ${await res.text()}`);
        process.exit(1);
      }
      console.log("Push succeeded.");
    } else {
      console.log("No filePath provided. Skipping push.");
    }

    console.log(`Canvas URL: ${canvasUrl}`);
  },
});

const mainCmd = defineCommand({
  meta: {
    name: "flue-canvas",
    description: "flue-canvas CLI — manage your live-edit AI HTML environments",
  },
  subCommands: {
    push: pushCmd,
  },
});

runMain(mainCmd);

