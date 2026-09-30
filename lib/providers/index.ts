import { LLMProvider } from "./types";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import { AnthropicProvider } from "./anthropic";

export const PROVIDER_NAMES = ["openai-compatible", "openai", "anthropic"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export interface ProviderOverride {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

const DEFAULT_MODELS: Record<ProviderName, string> = {
  "openai-compatible": "llama3.1",
  openai: "gpt-4o-mini",
  anthropic: "claude-opus-5",
};

const DEFAULT_BASE_URLS: Record<Exclude<ProviderName, "anthropic">, string> = {
  "openai-compatible": "http://localhost:11434/v1",
  openai: "https://api.openai.com/v1",
};

/** Reads the optional "Model settings" panel values out of an untrusted request body. */
export function parseOverride(raw: unknown): ProviderOverride | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const pick = (key: string) => {
    const value = (raw as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const override = {
    provider: pick("provider"),
    baseUrl: pick("baseUrl"),
    model: pick("model"),
    apiKey: pick("apiKey"),
  };
  return Object.values(override).some(Boolean) ? override : undefined;
}

function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
}

/**
 * A visitor-supplied base URL makes *our* server issue the request, so don't
 * let it reach localhost or the private network (cloud metadata endpoints,
 * internal services). Self-hosters who want to point the demo UI at a LAN
 * box can opt out with ALLOW_PRIVATE_BASE_URL=true.
 *
 * This checks the literal hostname only; it doesn't resolve DNS.
 */
export function assertSafeBaseUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Base URL is not a valid URL.");
  }
  if (process.env.ALLOW_PRIVATE_BASE_URL === "true") {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Base URL must use http or https.");
    }
    return;
  }
  if (url.protocol !== "https:") {
    throw new Error("Base URL must use https.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privatePatterns = [
    /^localhost$/,
    /\.localhost$/,
    /\.local$/,
    /\.internal$/,
    /^0\./,
    /^127\./,
    /^10\./,
    /^169\.254\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^::1?$/,
    /^f[cd][0-9a-f]{2}:/,
    /^fe80:/,
    /^::ffff:/,
  ];
  if (!host.includes(".") && !host.includes(":")) {
    throw new Error("Base URL must use a public hostname.");
  }
  if (privatePatterns.some((p) => p.test(host))) {
    throw new Error("Base URL can't point at a private or local address.");
  }
}

/**
 * Builds a provider from either server-side env vars (your own dev setup,
 * e.g. pointed at a self-hosted model) or a request-scoped override
 * (used by the public demo's "bring your own key" settings panel — never
 * persisted server-side).
 *
 * The server's own LLM_API_KEY is only ever sent to the server's own
 * configured endpoint: as soon as an override changes the provider or the
 * base URL, the override must bring its own key.
 */
export function getProvider(override?: ProviderOverride): LLMProvider {
  const retargeted = Boolean(override?.provider || override?.baseUrl);

  const providerName = override?.provider || process.env.LLM_PROVIDER || "openai-compatible";
  if (!isProviderName(providerName)) {
    throw new Error(`Unknown provider "${providerName}".`);
  }

  const model =
    override?.model ||
    (override?.provider ? undefined : process.env.LLM_MODEL) ||
    DEFAULT_MODELS[providerName];
  const apiKey = override?.apiKey || (retargeted ? undefined : process.env.LLM_API_KEY);

  if (providerName === "anthropic") {
    if (!apiKey) throw new Error("Missing API key for Anthropic provider.");
    return new AnthropicProvider(model, apiKey);
  }

  if (override?.baseUrl) assertSafeBaseUrl(override.baseUrl);
  const baseUrl =
    override?.baseUrl ||
    (override?.provider ? undefined : process.env.LLM_BASE_URL) ||
    DEFAULT_BASE_URLS[providerName];

  if (providerName === "openai" && !apiKey) {
    throw new Error("Missing API key for OpenAI provider.");
  }

  return new OpenAICompatibleProvider(baseUrl, model, apiKey);
}
