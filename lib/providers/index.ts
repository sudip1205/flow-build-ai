import { LLMProvider } from "./types";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import { AnthropicProvider } from "./anthropic";

/**
 * Builds a provider from either server-side env vars (your own dev setup,
 * e.g. pointed at a self-hosted model) or a request-scoped override
 * (used by the public demo's "bring your own key" settings panel — never
 * persisted server-side).
 */
export function getProvider(override?: {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): LLMProvider {
  const provider = override?.provider || process.env.LLM_PROVIDER || "openai-compatible";
  const model = override?.model || process.env.LLM_MODEL || "gpt-4o-mini";
  const apiKey = override?.apiKey || process.env.LLM_API_KEY;

  if (provider === "anthropic") {
    if (!apiKey) throw new Error("Missing API key for Anthropic provider.");
    return new AnthropicProvider(model, apiKey);
  }

  const baseUrl =
    override?.baseUrl ||
    process.env.LLM_BASE_URL ||
    (provider === "openai" ? "https://api.openai.com/v1" : "http://localhost:11434/v1");

  return new OpenAICompatibleProvider(baseUrl, model, apiKey);
}
