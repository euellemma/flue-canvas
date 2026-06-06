import { spawn, ChildProcess, execSync } from "node:child_process";
import assert from "node:assert";
import { describe, it, before, after } from "node:test";
import { createServer as createNetServer } from "node:net";
import WebSocket from "ws";

// Load local environment variables from .env
try {
  // @ts-ignore
  process.loadEnvFile();
} catch {
  // Ignore if .env is missing or process.loadEnvFile is not supported
}

const SIGNING_KEY = process.env.SIGNING_KEY;
const ID = "test-integration";

if (!SIGNING_KEY) {
  console.warn("⚠️ SIGNING_KEY is missing. Skipping live E2E canvas tests.");
  
  describe("flue-canvas end-to-end loop (Skipped)", () => {
    it("skipping E2E tests because SIGNING_KEY environment variable is not defined", () => {
      assert.ok(true);
    });
  });
} else {
  // Helper to compute token using the exact same HMAC logic
  const { createHmac } = await import("node:crypto");
  const computeToken = (id: string): string => {
    return createHmac("sha256", SIGNING_KEY).update(id).digest("hex");
  };

  // Helper to dynamically allocate a free TCP port
  const getFreePort = async (): Promise<number> => {
    return new Promise((resolve, reject) => {
      const server = createNetServer();
      server.listen(0, () => {
        const address = server.address();
        const port = typeof address === "string" ? 0 : address?.port ?? 0;
        server.close(() => resolve(port));
      });
      server.on("error", reject);
    });
  };

  // Helper to poll the server until it is ready
  const waitForServerReady = async (port: number, timeoutMs = 45000): Promise<void> => {
    const start = Date.now();
    const getUrl = `http://localhost:${port}/canvas?id=ping`;
    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Timeout waiting for dev server to start listening");
      }
      try {
        const res = await fetch(getUrl);
        // If we get any response status (e.g. 400 due to bad token, or 200), the server is listening
        if (res.status !== 0) {
          return;
        }
      } catch {
        // ignore connection refused
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  describe("flue-canvas end-to-end loop", () => {
    let devProcess: ChildProcess | null = null;
    let port = 3583;
    let serverUrl = "http://localhost:3583";

    before(async () => {
      console.log("Allocating a dynamic free port...");
      port = await getFreePort().catch(() => 3583);
      serverUrl = `http://localhost:${port}`;
      console.log(`Using port ${port} for integration tests.`);

      // Build the client bundle first so that ?raw imports are available
      const npmExec = process.env.npm_execpath;
      const buildClient = npmExec
        ? (npmExec.endsWith(".js") || npmExec.endsWith(".cjs")
            ? spawn(process.execPath, [npmExec, "run", "build:client"], { stdio: "inherit" })
            : spawn(npmExec, ["run", "build:client"], { stdio: "inherit" }))
        : spawn("npm", ["run", "build:client"], { stdio: "inherit" });

      await new Promise<void>((resolve, reject) => {
        buildClient.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error("Client build failed"));
        });
      });

      console.log("Starting local dev server...");
      // Spawn the flue dev server in a detached process group
      devProcess = spawn("npx", ["flue", "dev", "--target", "cloudflare", "--port", String(port)], {
        env: { ...process.env, SIGNING_KEY },
        detached: true,
      });

      // Pipe outputs to main process so logs are visible
      devProcess.stdout?.on("data", (data) => process.stdout.write(data));
      devProcess.stderr?.on("data", (data) => process.stderr.write(data));

      // Wait until the server is listening
      await waitForServerReady(port);
      console.log("Dev server is ready. Running tests...");
    });

    after(() => {
      if (devProcess && devProcess.pid) {
        console.log("Stopping local dev server...");
        if (process.platform === "win32") {
          try {
            execSync(`taskkill /pid ${devProcess.pid} /T /F`, { stdio: "ignore" });
          } catch {
            // ignore
          }
        } else {
          try {
            process.kill(-devProcess.pid, "SIGTERM");
          } catch {
            // ignore
          }
        }
      }
    });

    it("should reject connection when invalid token is provided", async () => {
      const invalidToken = "wrong-token";
      const wsUrl = `ws://localhost:${port}/workflows/canvas-turn?id=${ID}&token=${invalidToken}`;
      
      await new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl);
        ws.on("error", (err) => {
          assert.ok(err);
          resolve();
        });
        ws.on("open", () => {
          ws.close();
          assert.fail("Should not have opened connection with invalid token");
        });
      });
    });

    it("should successfully push, edit via workflow, and fetch the updated canvas", async () => {
      const token = computeToken(ID);

      // 1. Push a test page
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <body>
          <h1 id="header">Initial Canvas Content</h1>
        </body>
        </html>
      `;
      const pushUrl = `${serverUrl}/canvas/push?id=${ID}&token=${token}`;
      const pushRes = await fetch(pushUrl, { method: "POST", body: testHtml });
      assert.strictEqual(pushRes.status, 200);

      // 2. Trigger editing workflow via WebSocket
      const wsUrl = `ws://localhost:${port}/workflows/canvas-turn?id=${ID}&token=${token}`;
      const ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => {
          ws.send(JSON.stringify({
            version: 1,
            type: "invoke",
            requestId: "test-integration-id",
            payload: {
              id: ID,
              message: "change the heading text to 'Hello Integration' and make it purple",
            },
          }));
        });

        ws.on("message", (data) => {
          const frame = JSON.parse(data.toString());
          if (frame.type === "result") {
            assert.strictEqual(frame.result.canvasChanged, true);
            resolve();
          }
          if (frame.type === "error") {
            reject(new Error(frame.error?.message || "Workflow error"));
          }
        });

        ws.on("error", (err) => reject(err));
      });

      // 3. Fetch canvas and verify content got updated
      const getUrl = `${serverUrl}/canvas?id=${ID}&token=${token}`;
      const getRes = await fetch(getUrl);
      assert.strictEqual(getRes.status, 200);

      const updatedHtml = await getRes.text();
      assert.ok(updatedHtml.includes("Hello Integration"));
      assert.ok(updatedHtml.includes("purple"));
    });
  });
}
