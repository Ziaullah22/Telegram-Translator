/**
 * --- AI WEB WORKER ---
 * 
 * This file runs in a separate background thread.
 * It prevents the UI from lagging while the AI is loading or generating text.
 */
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// Initialize the handler that listens for messages from the main thread
const handler = new WebWorkerMLCEngineHandler();

// Listen for messages
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
