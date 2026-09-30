import { describe, expect, it } from "vitest";
import { formatFields, parseFields } from "@/lib/graph/fields";
import { toPromptSpec } from "@/lib/graph/toPromptSpec";
import { parseGraph } from "@/lib/graph/parse";
import { parseAssistReply } from "@/lib/prompts/assist";
import { edge, graph, node } from "./fixtures";

describe("parseFields", () => {
  it("splits comma-separated names with optional initial values", () => {
    expect(parseFields("orders, total = 0,count=1")).toEqual([
      { name: "orders" },
      { name: "total", value: "0" },
      { name: "count", value: "1" },
    ]);
  });

  it("keeps commas inside brackets and quotes", () => {
    expect(parseFields("limits = [1, 2], greeting = 'hi, there', opts = {a: 1, b: 2}")).toEqual([
      { name: "limits", value: "[1, 2]" },
      { name: "greeting", value: "'hi, there'" },
      { name: "opts", value: "{a: 1, b: 2}" },
    ]);
  });

  it("ignores empty entries and accepts one per line", () => {
    expect(parseFields(" a,, \nb ,")).toEqual([{ name: "a" }, { name: "b" }]);
    expect(parseFields(undefined)).toEqual([]);
    expect(formatFields(parseFields("a,b=2"))).toBe("a, b = 2");
  });
});

describe("dataStore variables", () => {
  it("are listed in the codegen spec", () => {
    const g = graph(
      [node("s", "start"), node("d", "dataStore", { label: "Order state", fields: "orders, total = 0" }), node("e", "end")],
      [edge("s", "d"), edge("d", "e")]
    );
    expect(toPromptSpec(g)).toContain('- [d] DATA "Order state" (variables: orders; total = 0)');
  });

  it("survive request parsing on dataStores only", () => {
    const parsed = parseGraph({
      nodes: [
        { id: "d", data: { kind: "dataStore", label: "x", fields: "a, b" } },
        { id: "s", data: { kind: "step", label: "y", fields: "a" } },
      ],
      edges: [],
    });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.graph.nodes.map((n) => n.data.fields)).toEqual(["a, b", undefined]);
  });

  it("are read from the assistant as text or a list", () => {
    const result = parseAssistReply(
      JSON.stringify({
        reply: "ok",
        diagram: {
          nodes: [
            { id: "a", kind: "dataStore", label: "State", fields: ["orders", "total = 0"] },
            { id: "b", kind: "dataStore", label: "More", fields: "x,y=1" },
          ],
          edges: [],
        },
      })
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.graph!.nodes.map((n) => n.data.fields)).toEqual(["orders, total = 0", "x, y = 1"]);
  });
});
