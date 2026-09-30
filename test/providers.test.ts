import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { assertSafeBaseUrl, getProvider } from "@/lib/providers";
import { OpenAICompatibleProvider } from "@/lib/providers/openaiCompatible";
import { AnthropicProvider } from "@/lib/providers/anthropic";

const ENV_KEYS = ["LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY", "ALLOW_PRIVATE_BASE_URL"];

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (..._args: unknown[]) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => ENV_KEYS.forEach((k) => delete process.env[k]));
afterEach(() => vi.unstubAllGlobals());

describe("OpenAICompatibleProvider", () => {
  it("posts to /chat/completions and returns the message content", async () => {
    const fetchMock = mockFetch({ choices: [{ message: { content: "print(1)" } }] });
    const provider = new OpenAICompatibleProvider("https://llm.example.com/v1/", "m", "k");

    await expect(provider.generate("hi")).resolves.toEqual({ text: "print(1)", truncated: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m", messages: [{ role: "user", content: "hi" }] });
  });

  it("reports a reply that stopped at the length limit", async () => {
    mockFetch({ choices: [{ message: { content: "def f(" }, finish_reason: "length" }] });
    const provider = new OpenAICompatibleProvider("https://llm.example.com/v1", "m");
    await expect(provider.generate("hi")).resolves.toEqual({ text: "def f(", truncated: true });
  });

  it("surfaces HTTP errors", async () => {
    mockFetch({ error: "nope" }, 500);
    await expect(new OpenAICompatibleProvider("https://x.example.com", "m").generate("hi")).rejects.toThrow(/500/);
  });
});

describe("getProvider", () => {
  it("defaults to a local OpenAI-compatible endpoint", () => {
    expect(getProvider()).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("builds an Anthropic provider when configured with a key", () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_API_KEY = "sk-test";
    expect(getProvider()).toBeInstanceOf(AnthropicProvider);
  });

  it("requires a key for Anthropic and OpenAI", () => {
    expect(() => getProvider({ provider: "anthropic" })).toThrow(/API key/);
    expect(() => getProvider({ provider: "openai" })).toThrow(/API key/);
  });

  it("rejects unknown providers", () => {
    expect(() => getProvider({ provider: "mystery" })).toThrow(/Unknown provider/);
  });

  it("never sends the server's key to a visitor-supplied base URL", async () => {
    process.env.LLM_API_KEY = "server-secret";
    const fetchMock = mockFetch({ choices: [{ message: { content: "ok" } }] });

    await getProvider({ baseUrl: "https://attacker.example.com/v1" }).generate("hi");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("attacker.example.com");
    expect(JSON.stringify(init.headers)).not.toContain("server-secret");
  });

  it("does use the server's key for the server's own endpoint", async () => {
    process.env.LLM_BASE_URL = "https://my-llm.example.com/v1";
    process.env.LLM_API_KEY = "server-secret";
    const fetchMock = mockFetch({ choices: [{ message: { content: "ok" } }] });

    await getProvider({ model: "other-model" }).generate("hi");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer server-secret");
  });
});

describe("assertSafeBaseUrl", () => {
  it.each([
    "http://api.example.com/v1",
    "https://localhost:11434/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.5/v1",
    "https://169.254.169.254/latest",
    "https://192.168.1.10/v1",
    "https://[::1]/v1",
    "https://intranet/v1",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => assertSafeBaseUrl(url)).toThrow();
  });

  it("accepts public https hosts", () => {
    expect(() => assertSafeBaseUrl("https://openrouter.ai/api/v1")).not.toThrow();
  });

  it("allows private hosts when explicitly enabled", () => {
    process.env.ALLOW_PRIVATE_BASE_URL = "true";
    expect(() => assertSafeBaseUrl("http://192.168.1.10:11434/v1")).not.toThrow();
  });
});
