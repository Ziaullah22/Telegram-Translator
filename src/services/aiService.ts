import * as webllm from "@mlc-ai/web-llm";

export type AIStatus = "idle" | "loading" | "ready" | "error";

class AIService {
  private engine: any = null;
  private selectedModel = "Qwen2-1.5B-Instruct-q4f16_1-MLC";
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

      const webllm = await import("@mlc-ai/web-llm");

      this.engine = await webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" }),
        this.selectedModel,
        {
          initProgressCallback: (report: webllm.InitProgressReport) => {
            this.progress = Math.round(report.progress * 100);
            this.updateStatus();
          },
          // TURBO MODE: Request high-performance for speed
          adapterOptions: {
            powerPreference: 'high-performance'
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

    const systemPrompt = `You are a human friend. 
    REPLY to the user's message naturally.
    
    Examples:
    User: "Are you free?" -> Reply: "Yeah, I'm free! What's up?"
    User: "How are you?" -> Reply: "I'm good, you?"
    User: "I need help" -> Reply: "Sure, what do you need help with?"

    Tone: ${tone.toUpperCase()}.
    Rule: If the user asks a question, you MUST answer it directly.`;

    // Filter to find the absolute last message from the contact (the 'user')
    const lastUserMessage = [...lastMessages]
      .reverse()
      .find(msg => !msg.is_outgoing && (msg.translated_text || msg.original_text));

    if (!lastUserMessage) {
      return "Hey! What's up?";
    }

    const chatHistory = [{
      role: "user",
      content: lastUserMessage.translated_text || lastUserMessage.original_text
    }];

    try {
      console.log("AI Generating with tone:", tone, "History length:", chatHistory.length);
      const messages = [
        { role: "system", content: systemPrompt },
        ...chatHistory as any[]
      ];

      const reply = await this.engine.chat.completions.create({
        messages,
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 48, // Reduced for much faster speed
      });

      const result = reply.choices[0].message.content || "";
      console.log("AI Result:", result);
      return result.trim() || "I'm here to help! What's on your mind?";
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
