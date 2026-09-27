import { LLMProvider } from "./types";

/**
 * Works with anything that speaks the OpenAI /chat/completions dialect:
 * Ollama, LM Studio, vLLM, LocalAI, OpenRouter, or a self-hosted endpoint.
 * Nothing about a specific private endpoint is hardcoded here — it's all
 * configuration (env vars locally, request override for the public demo).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private baseUrl: string,
    private model: string,
    private apiKey?: string
  ) {}

  async generate(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}
