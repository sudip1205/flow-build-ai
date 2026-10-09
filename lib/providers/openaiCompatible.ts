import { Generation, LLMProvider } from "./types";

/**
 * Works with anything that speaks the OpenAI /chat/completions dialect:
 * Ollama, LM Studio, vLLM, LocalAI, OpenRouter, or a self-hosted endpoint.
 * Nothing about a specific private endpoint is hardcoded here — it's all
 * configuration (env vars locally, request override for the public demo).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private baseUrl: string,
    readonly model: string,
    private apiKey?: string
  ) {}

  async generate(prompt: string): Promise<Generation> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
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
    } catch {
      // Network-level failure: nothing is listening, or the host doesn't resolve.
      throw new Error(`Couldn't reach the model server at ${this.baseUrl} — is it running?`);
    }
    if (!res.ok) {
      const detail = await res.text();
      // Ollama answers "model is required" for any name it can't parse (a
      // space, a stray slash, a pasted URL), not just a missing one.
      if (res.status === 400 && /model is required/i.test(detail)) {
        throw new Error(
          `The model server didn't accept the model name "${this.model}". ` +
            "Check the Model field in Model settings (a name like qwen2.5:14b), or clear it to use the server's default."
        );
      }
      throw new Error(`LLM request failed (model "${this.model}"): ${res.status} ${detail}`);
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    // "length": the model hit max_tokens, or (Ollama) filled its context window.
    return { text: choice?.message?.content ?? "", truncated: choice?.finish_reason === "length" };
  }
}
