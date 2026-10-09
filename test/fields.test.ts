import { describe, expect, it } from "vitest";
import { formatField, formatFields, parseField, parseFields } from "@/lib/graph/fields";
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

describe("typed fields", () => {
  it("read an optional type before the initial value", () => {
    expect(parseFields("id: string, total: number = 0, tags = [a: 1]")).toEqual([
      { name: "id", type: "string" },
      { name: "total", type: "number", value: "0" },
      { name: "tags", value: "[a: 1]" },
    ]);
    expect(formatFields(parseFields("total:number=0, id"))).toBe("total: number = 0, id");
  });

  it("read one table row as a whole, commas and all, and write it back the same way", () => {
    expect(parseField(" tags: list = [1, 2] ")).toEqual({ name: "tags", type: "list", value: "[1, 2]" });
    expect(parseField("count")).toEqual({ name: "count" });
    expect(formatField(parseField("total:number=0"))).toBe("total: number = 0");
  });
});

describe("data objects", () => {
  it("are listed before the flow in the codegen spec", () => {
    const g = {
      ...graph([node("s", "start"), node("e", "end", { label: "End" })], [edge("s", "e")]),
      data: [
        {
          id: "o",
          name: "Order",
          role: "input" as const,
          description: "what to process",
          fields: [{ name: "id", type: "string" }, { name: "total", type: "number", value: "0" }],
        },
      ],
    };
    expect(toPromptSpec(g).split("\n")).toEqual([
      "DATA:",
      "- Order (input): what to process",
      "    id: string",
      "    total: number = 0",
      "",
      "FLOW:",
      "- [s] START",
      "    -> e",
      "- [e] END",
    ]);
  });

  it("survive request parsing, with fields as a list or as text", () => {
    const parsed = parseGraph({
      nodes: [],
      edges: [],
      data: [
        { id: "a", name: "Order", role: "input", fields: [{ name: "id", type: "string" }, { name: " " }, "total = 0"] },
        { name: "Totals", role: "bogus", fields: "sum: number = 0" },
      ],
    });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.graph.data).toEqual([
      { id: "a", name: "Order", role: "input", description: undefined, fields: [{ name: "id", type: "string" }, { name: "total", value: "0" }] },
      { id: "data_2", name: "Totals", role: "state", description: undefined, fields: [{ name: "sum", type: "number", value: "0" }] },
    ]);
    expect(parseGraph({ nodes: [], edges: [], data: [{ fields: [] }] })).toHaveProperty("error");
    expect(parseGraph({ nodes: [], edges: [], data: "x" })).toHaveProperty("error");
  });

  it("are left out of a graph that never had any", () => {
    const parsed = parseGraph({ nodes: [], edges: [] });
    expect(parsed).toEqual({ graph: { nodes: [], edges: [] } });
  });
});

describe("old dataStore nodes", () => {
  it("become data objects, and the flow skips over where they were", () => {
    const parsed = parseGraph({
      nodes: [
        { id: "s", data: { kind: "start" } },
        { id: "o", data: { kind: "dataStore", label: "orders", description: "list of orders" } },
        { id: "t", data: { kind: "dataStore", label: "total", description: "starts at 0" } },
        { id: "st", data: { kind: "dataStore", label: "Order state", fields: "seen, count = 0" } },
        { id: "w", data: { kind: "step", label: "Work" } },
        { id: "e", data: { kind: "end" } },
      ],
      edges: [
        { id: "1", source: "s", target: "o" },
        { id: "2", source: "o", target: "t" },
        { id: "3", source: "t", target: "st" },
        { id: "4", source: "st", target: "w" },
        { id: "5", source: "w", target: "e" },
      ],
    });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.graph.nodes.map((n) => n.id)).toEqual(["s", "w", "e"]);
    expect(parsed.graph.edges).toEqual([
      { id: "1", source: "s", target: "w", label: undefined },
      { id: "5", source: "w", target: "e", label: undefined },
    ]);
    expect(parsed.graph.data).toEqual([
      {
        id: "o",
        name: "State",
        role: "state",
        description: "orders: list of orders; total: starts at 0",
        fields: [{ name: "orders" }, { name: "total" }],
      },
      { id: "st", name: "OrderState", role: "state", description: undefined, fields: [{ name: "seen" }, { name: "count", value: "0" }] },
    ]);
  });

  it("drop edges into a data node that led nowhere, and survive loops of them", () => {
    const parsed = parseGraph({
      nodes: [
        { id: "s", data: { kind: "start" } },
        { id: "a", data: { kind: "dataStore", label: "a" } },
        { id: "b", data: { kind: "dataStore", label: "b" } },
      ],
      edges: [
        { id: "1", source: "s", target: "a" },
        { id: "2", source: "a", target: "b" },
        { id: "3", source: "b", target: "a" },
      ],
    });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.graph.edges).toEqual([]);
  });
});
