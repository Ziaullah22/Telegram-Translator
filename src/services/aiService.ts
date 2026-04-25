import * as webllm from "@mlc-ai/web-llm";

export type AIStatus = "idle" | "loading" | "ready" | "error";

class AIService {
  private engine: any = null;
  private selectedModel = "gemma-2b-it-q4f16_1-MLC";
  private status: AIStatus = "idle";
  private progress = 0;
  private onStatusChange: ((status: AIStatus, progress: number) => void) | null = null;

  constructor() {
    if (localStorage.getItem("ai_auto_init") === "true") {
      setTimeout(() => this.init(), 1000);
    }
  }

  public setStatusCallback(callback: (status: AIStatus, progress: number) => void) {
    this.onStatusChange = callback;
  }

  public async init() {
    if (this.engine && this.status === "ready") return;

    try {
      this.status = "loading";
      this.updateStatus();

      this.engine = await webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" }),
        this.selectedModel,
        {
          initProgressCallback: (report: webllm.InitProgressReport) => {
            this.progress = Math.round(report.progress * 100);
            this.updateStatus();
          },
          // Cast to any to bypass strict type checking for adapterOptions
          adapterOptions: {
            powerPreference: 'low-power'
          }
        } as any
      );
      
      this.status = "ready";
      this.progress = 100;
      this.updateStatus();
      localStorage.setItem("ai_auto_init", "true");
    } catch (error) {
      console.error("AI Init Error:", error);
      this.status = "error";
      this.updateStatus();
    }
  }

  public async generateReply(lastMessages: any[], tone: "professional" | "friendly" | "closer" = "friendly"): Promise<string> {
    if (!this.engine || this.status !== "ready") {
      throw new Error("AI not ready");
    }

    const systemPrompt = `You are an expert sales assistant for a Telegram marketing platform. 
    Your goal is to suggest a reply to the customer. 
    Tone: ${tone.toUpperCase()}. 
    Keep it concise and natural. Use the conversation history to stay relevant.`;

    // Filter out messages with no text content (e.g., pure media messages)
    const chatHistory = lastMessages
      .filter(msg => (msg.translated_text || msg.original_text))
      .map(msg => ({
        role: msg.is_outgoing ? "assistant" : "user",
        content: msg.translated_text || msg.original_text
      }));

    if (chatHistory.length === 0) {
      return "Hello! How can I help you today?";
    }

    try {
      console.log("AI Generating with tone:", tone, "History length:", chatHistory.length);
      const messages = [
        { role: "system", content: systemPrompt },
        ...chatHistory as any[]
      ];

      const reply = await this.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 128,
      });

      const result = reply.choices[0].message.content || "";
      console.log("AI Result:", result);
      return result || "I'm here to help! What's on your mind?";
    } catch (err) {
      console.error("Inference Error:", err);
      return "I'm sorry, I'm having trouble thinking of a reply right now. Could you try again?";
    }
  }

  private updateStatus() {
    if (this.onStatusChange) {
      this.onStatusChange(this.status, this.progress);
    }
  }

  public getStatus() {
    return { status: this.status, progress: this.progress };
  }
}

export const aiService = new AIService();
