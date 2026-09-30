import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/assist/route";
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from "@/lib/examples";
import { buildAssistPrompt, parseAssistReply } from "@/lib/prompts/assist";
import { validateGraph } from "@/lib/graph/validate";

const VALID_DIAGRAM = {
  nodes: [
    { id: "start", kind: "start", label: "Start" },
    { id: "count", kind: "dataStore", label: "count", description: "starts at 0" },
    { id: "more", kind: "decision", label: "Below 10?", condition: "count < 10" },
    { id: "inc", kind: "step", label: "Increment", description: "count += 1" },
    { id: "end", kind: "end", label: "Done" },
  ],
  edges: [
    { from: "start", to: "count" },
    { from: "count", to: "more" },
    { from: "more", to: "inc", label: "yes" },
    { from: "inc", to: "more" },
    { from: "more", to: "end", label: "no" },
  ],
};

const modelSays = (reply: unknown) =>
  Response.json({ choices: [{ message: { content: typeof reply === "string" ? reply : JSON.stringify(reply) } }] });

describe("parseAssistReply", () => {
  it("builds a valid graph from a well-formed reply", () => {
    const result = parseAssistReply(JSON.stringify({ reply: "Counted to 10.", diagram: VALID_DIAGRAM }));
    if ("error" in result) throw new Error(result.error);
    expect(result.reply).toBe("Counted to 10.");
    expect(validateGraph(result.graph!).valid).toBe(true);
  });

  it("accepts an answer with no diagram change", () => {
    expect(parseAssistReply('{"reply": "Use a dataStore.", "diagram": null}')).toEqual({
      reply: "Use a dataStore.",
      graph: null,
    });
  });

  it("ignores a diagram drawn in answer to a question", () => {
    const raw = JSON.stringify({ intent: "question", reply: "Use a dataStore.", diagram: VALID_DIAGRAM });
    expect(parseAssistReply(raw)).toEqual({ reply: "Use a dataStore.", graph: null });
  });

  it("forgives fences, chatter, kind synonyms and True/False branches", () => {
    const raw = [
      "Sure! Here you go:",
      "```json",
      JSON.stringify({
        reply: "ok",
        diagram: {
          nodes: [
            { id: "s", kind: "Start" },
            { id: "v", kind: "variable", label: "x" },
            { id: "d", kind: "Decision", label: "x > 1?" },
            { id: "a", kind: "action", label: "Shout" },
            { id: "e", kind: "stop" },
          ],
          edges: [
            { from: "s", to: "v" },
            { from: "v", to: "d" },
            { from: "d", to: "a", label: "True" },
            { from: "d", to: "e", label: "False" },
            { from: "a", to: "e", label: "ignored on a step" },
          ],
        },
      }),
      "```",
    ].join("\n");
    const result = parseAssistReply(raw);
    if ("error" in result) throw new Error(result.error);
    expect(result.graph!.nodes.map((n) => n.data.kind)).toEqual(["start", "dataStore", "decision", "step", "end"]);
    expect(result.graph!.edges.map((e) => e.label)).toEqual([undefined, undefined, "yes", "no", undefined]);
    expect(validateGraph(result.graph!).valid).toBe(true);
  });

  it("de-duplicates node ids", () => {
    const result = parseAssistReply(
      JSON.stringify({ reply: "", diagram: { nodes: [{ id: "a", kind: "step" }, { id: "a", kind: "step" }], edges: [] } })
    );
    if ("error" in result) throw new Error(result.error);
    expect(new Set(result.graph!.nodes.map((n) => n.id)).size).toBe(2);
  });

  it("explains unusable replies", () => {
    expect(parseAssistReply("I can't do that")).toEqual({ error: "The response wasn't valid JSON." });
    expect(parseAssistReply('{"reply":"x","diagram":{"nodes":[{"kind":"blob"}],"edges":[]}}')).toMatchObject({
      error: expect.stringContaining('unknown kind "blob"'),
    });
  });
});

describe("buildAssistPrompt", () => {
  it("includes the node guide, the current diagram and the request", () => {
    const prompt = buildAssistPrompt("add logging", EXAMPLE_DIAGRAM);
    expect(prompt).toContain("- dataStore:");
    expect(prompt).toContain('"label":"More orders?"');
    expect(prompt).toContain("add logging");
  });
});

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/assist", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  process.env.LLM_BASE_URL = "https://llm.example.com/v1";
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/assist", () => {
  it("rejects an empty request", async () => {
    const res = await POST(request({ request: "  ", graph: EMPTY_DIAGRAM }));
    expect(res.status).toBe(400);
  });

  it("returns a laid-out diagram the code generator accepts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => modelSays({ reply: "Built a counter.", diagram: VALID_DIAGRAM })));
    const res = await POST(request({ request: "count to 10", graph: EMPTY_DIAGRAM }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toBe("Built a counter.");
    expect(data.issues).toEqual([]);
    expect(validateGraph(data.graph).valid).toBe(true);
    const ys = data.graph.nodes.map((n: { position: { y: number } }) => n.position.y);
    expect(new Set(ys).size).toBeGreaterThan(1);
  });

  it("answers questions without changing the diagram", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => modelSays({ reply: "Use a dataStore.", diagram: null })));
    const res = await POST(request({ request: "what is a variable?", graph: EXAMPLE_DIAGRAM }));
    expect(await res.json()).toEqual({ reply: "Use a dataStore.", graph: null, issues: [] });
  });

  it("asks the model to fix an invalid diagram once", async () => {
    const broken = { ...VALID_DIAGRAM, edges: VALID_DIAGRAM.edges.filter((e) => e.label !== "no") };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelSays({ reply: "first try", diagram: broken }))
      .mockResolvedValueOnce(modelSays({ reply: "fixed", diagram: VALID_DIAGRAM }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ request: "count to 10", graph: EMPTY_DIAGRAM }));
    const data = await res.json();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repair = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(repair.messages[0].content).toContain('must have exactly one "yes" and one "no"');
    expect(repair.messages[0].content).toContain('Nothing leads to "end" (end).');
    expect(data.reply).toBe("fixed");
    expect(data.issues).toEqual([]);
  });

  it("returns remaining issues when the fix still isn't valid", async () => {
    const broken = { ...VALID_DIAGRAM, edges: VALID_DIAGRAM.edges.filter((e) => e.label !== "no") };
    vi.stubGlobal("fetch", vi.fn(async () => modelSays({ reply: "tried", diagram: broken })));
    const res = await POST(request({ request: "count to 10", graph: EMPTY_DIAGRAM }));
    expect(res.status).toBe(200);
    expect((await res.json()).issues.length).toBeGreaterThan(0);
  });

  it("reports unusable model output as 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => modelSays("no idea")));
    const res = await POST(request({ request: "count to 10", graph: EMPTY_DIAGRAM }));
    expect(res.status).toBe(502);
  });
});
