import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/generate/route";
import { EXAMPLE_DIAGRAM } from "@/lib/examples";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/generate", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  process.env.LLM_BASE_URL = "https://llm.example.com/v1";
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/generate", () => {
  it("rejects malformed JSON", async () => {
    const res = await POST(request("{"));
    expect(res.status).toBe(400);
  });

  it("rejects unsupported languages", async () => {
    const res = await POST(request({ graph: EXAMPLE_DIAGRAM, language: "cobol" }));
    expect(res.status).toBe(400);
  });

  it("returns every validation error for an invalid graph", async () => {
    const res = await POST(request({ graph: { nodes: [], edges: [] }, language: "python" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("rejects unsafe provider overrides before calling any model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(
      request({
        graph: EXAMPLE_DIAGRAM,
        language: "python",
        providerOverride: { baseUrl: "https://169.254.169.254/latest" },
      })
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the extracted code on success", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      Response.json({ choices: [{ message: { content: "```python\ndef run():\n    pass\n```" } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ graph: EXAMPLE_DIAGRAM, language: "python" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.files).toEqual([{ path: "app/services/flow_service.py", content: "def run():\n    pass" }]);
    expect(data.truncated).toBe(false);
    expect(data.prompt).toContain(data.spec);
    expect(data.raw).toContain("def run()");
    expect(data.model).toEqual(expect.any(String));
    expect(data.durationMs).toEqual(expect.any(Number));

    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.messages[0].content).toContain('DECISION "More orders?"');
  });

  it("flags a reply cut off at the output limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ choices: [{ message: { content: "```python app/main.py\nimport fa" }, finish_reason: "length" }] })
      )
    );
    const res = await POST(request({ graph: EXAMPLE_DIAGRAM, language: "python" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.truncated).toBe(true);
    expect(data.files).toEqual([{ path: "app/main.py", content: "import fa" }]);
  });

  it("reports model failures as 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    const res = await POST(request({ graph: EXAMPLE_DIAGRAM, language: "go" }));
    expect(res.status).toBe(502);
  });
});
