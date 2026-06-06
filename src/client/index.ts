interface SendPromptResult {
  canvasChanged: boolean;
  message: string;
}

class FCAgentClient {
  readonly wsUrl: string;
  readonly canvasId: string;

  constructor(wsUrl: string, canvasId: string) {
    this.wsUrl = wsUrl;
    this.canvasId = canvasId;
  }

  async send(
    prompt: string,
    log?: (msg: string) => void,
  ): Promise<SendPromptResult> {
    const { wsUrl, canvasId } = this;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const parts: string[] = [];

      ws.onmessage = (e) => {
        const frame = JSON.parse(e.data);

        if (frame.type === "event" && frame.event) {
          const event = frame.event;

          if (event.type === "message_end" && event.message?.content) {
            for (const block of event.message.content as Array<
              Record<string, unknown>
            >) {
              if (block.type === "text" && typeof block.text === "string") {
                parts.push(block.text);
                log?.(block.text);
              }
              if (
                block.type === "thinking" &&
                typeof block.thinking === "string"
              ) {
                parts.push(block.thinking);
                log?.(`[thinking] ${block.thinking}`);
              }
            }
          }

          if (
            event.type === "tool_execution_start" &&
            typeof event.toolName === "string"
          ) {
            log?.(
              `[tool] ${event.toolName} ${JSON.stringify(event.args ?? {})}`,
            );
          }
        }

        if (frame.type === "result" && frame.result) {
          resolve({
            canvasChanged: frame.result.canvasChanged === true,
            message: frame.result.message ?? parts.join(""),
          });
          ws.close();
        }

        if (frame.type === "error") {
          reject(new Error(frame.error?.message ?? "Workflow error"));
          ws.close();
        }
      };

      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            version: 1,
            type: "invoke",
            requestId: crypto.randomUUID(),
            payload: { id: canvasId, message: prompt },
          }),
        );

      ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
        ws.close();
      };
    });
  }
}

(window as any).FCAgentClient = new FCAgentClient(
  (window as any).__CANVAS_WS__,
  (window as any).__CANVAS_ID__,
);
