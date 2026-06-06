import {
  createAgent,
  defineAgentProfile,
  type FlueContext,
  type WorkflowWebSocketHandler,
} from "@flue/runtime";
import defaultHtml from "../client/default.html?raw";

// Expose the workflow over WebSocket
export const websocket: WorkflowWebSocketHandler = async (_c, next) => next();

const assistant = defineAgentProfile({
  name: "assistant",
  instructions:
    "You are a helpful assistant, you respond to requests from user by editing /canvas.html as the user is currently seeing that in the browser",
});

const agent = createAgent(() => ({
  profile: assistant,
  model: "cloudflare/@cf/google/gemma-4-26b-a4b-it",
}));

export async function run({ init, payload, env }: FlueContext) {
  const { id, message } = payload as {
    id: string;
    message: string;
  };

  // verify if flue offers any auto validation we can use for workflow input
  if (!id) throw new Error('"id" is required in the payload');
  if (!message) throw new Error('"message" is required in the payload');

  const bucket = (env as Record<string, unknown>).CANVAS_BUCKET as R2Bucket;

  // Use default HTML if no file exists yet — first visit bootstraps it on first save
  let oldHtml: string;
  const object = await bucket.get(id);
  if (object) {
    oldHtml = await object.text();
  } else {
    oldHtml = defaultHtml;
  }

  const harness = await init(agent);
  const session = await harness.session(id);
  await session.fs.writeFile("/canvas.html", oldHtml);
  const { text: assistantMessage } = await session.prompt(message);
  const newHtml = await session.fs.readFile("/canvas.html");
  await bucket.put(id, newHtml);

  if (oldHtml !== newHtml) {
    return { canvasChanged: true, message: assistantMessage };
  }
  return { canvasChanged: false, message: assistantMessage };
}
