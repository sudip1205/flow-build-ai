import Anthropic from "@anthropic-ai/sdk";
import { Generation, LLMProvider } from "./types";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(readonly model: string, apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(prompt: string): Promise<Generation> {
    let response: Anthropic.Message;
    try {
      // A whole project is a long reply: stream it so the request doesn't time out.
      response = await this.client.messages
        .stream({
          model: this.model,
          max_tokens: 64000,
          messages: [{ role: "user", content: prompt }],
        })
        .finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new Error("Anthropic rejected the API key.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new Error("Anthropic rate limit hit — try again shortly.");
      }
      if (err instanceof Anthropic.APIError) {
        throw new Error(`LLM request failed: ${err.status ?? ""} ${err.message}`.trim());
      }
      throw err;
    }

    if (response.stop_reason === "refusal") {
      throw new Error("The model declined to generate code for this diagram.");
    }
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return { text, truncated: response.stop_reason === "max_tokens" };
  }
}
