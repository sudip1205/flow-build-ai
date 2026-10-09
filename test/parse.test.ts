import { describe, it, expect } from "vitest";
import { parseGraph } from "@/lib/graph/parse";
import { deserializeDiagram, serializeDiagram } from "@/lib/storage";
import { EXAMPLE_DIAGRAM } from "@/lib/examples";

describe("parseGraph", () => {
  it("rejects non-graphs", () => {
    expect(parseGraph(null)).toHaveProperty("error");
    expect(parseGraph({ nodes: [] })).toHaveProperty("error");
    expect(parseGraph({ nodes: [{ id: "x", data: { kind: "bogus" } }], edges: [] })).toHaveProperty("error");
  });

  it("takes the node type from data.kind and drops unknown fields", () => {
    const result = parseGraph({
      nodes: [{ id: "s", type: "default", data: { kind: "start", label: "Go", extra: 1 } }],
      edges: [],
    });
    expect(result).toEqual({
      graph: {
        nodes: [
          {
            id: "s",
            type: "start",
            position: { x: 0, y: 0 },
            data: { kind: "start", label: "Go", description: undefined, condition: undefined },
          },
        ],
        edges: [],
      },
    });
  });
});

describe("call nodes", () => {
  it("keep their call settings, and drop them on other kinds", () => {
    const result = parseGraph({
      nodes: [
        {
          id: "a",
          data: { kind: "call", label: "Verify", callType: "grpc", operation: "unary", target: "Svc/Verify", input: "R.id", output: "R.ok" },
        },
        { id: "b", data: { kind: "call", label: "Mystery", callType: "teleport" } },
        { id: "d", data: { kind: "decision", label: "Ok?", callType: "db", target: "users" } },
      ],
      edges: [],
    });
    if ("error" in result) throw new Error(result.error);
    const [a, b, d] = result.graph.nodes.map((n) => n.data);
    expect(a).toMatchObject({ callType: "grpc", operation: "unary", target: "Svc/Verify", input: "R.id", output: "R.ok" });
    expect(b.callType).toBe("rest");
    expect(d.callType).toBeUndefined();
    expect(d.target).toBeUndefined();
  });

  it("replace old api/db steps; logic steps stay steps", () => {
    const result = parseGraph({
      nodes: [
        { id: "a", data: { kind: "step", label: "Call CRM", action: "api", resource: "POST /owners" } },
        { id: "b", data: { kind: "step", label: "Save", action: "db", resource: "users" } },
        { id: "c", data: { kind: "step", label: "Score", action: "logic" } },
      ],
      edges: [],
    });
    if ("error" in result) throw new Error(result.error);
    const [a, b, c] = result.graph.nodes;
    expect(a).toMatchObject({ type: "call", data: { kind: "call", callType: "rest", target: "POST /owners" } });
    expect(b).toMatchObject({ type: "call", data: { kind: "call", callType: "db", target: "users" } });
    expect(c.data).toEqual({ kind: "step", label: "Score", description: undefined, condition: undefined });
  });
});

describe("node sizes", () => {
  it("keeps a sensible size and drops a broken one", () => {
    const parsed = parseGraph({
      nodes: [
        { id: "a", size: { width: 300.4, height: 120 }, data: { kind: "step", label: "A" } },
        { id: "b", size: { width: -5, height: 80 }, data: { kind: "step", label: "B" } },
        { id: "c", size: { width: 1e9, height: "tall" }, data: { kind: "step", label: "C" } },
        { id: "d", data: { kind: "step", label: "D" } },
      ],
      edges: [],
    });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.graph.nodes.map((n) => n.size)).toEqual([{ width: 300, height: 120 }, undefined, undefined, undefined]);
  });
});

describe("diagram files", () => {
  it("round-trips through serialize/deserialize", () => {
    const text = serializeDiagram({ graph: EXAMPLE_DIAGRAM, language: "go" });
    const result = deserializeDiagram(text);
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.language).toBe("go");
    expect(result.graph.edges).toEqual(EXAMPLE_DIAGRAM.edges);
    expect(result.graph.nodes.map((n) => n.id)).toEqual(EXAMPLE_DIAGRAM.nodes.map((n) => n.id));
    expect(result.graph.nodes.map((n) => n.data)).toMatchObject(EXAMPLE_DIAGRAM.nodes.map((n) => n.data));
    expect(result.graph.data).toEqual(EXAMPLE_DIAGRAM.data);
  });

  it("rejects unrelated JSON", () => {
    expect(deserializeDiagram('{"hello": 1}')).toEqual({ error: "That file isn't a FlowBuild-AI diagram." });
    expect(deserializeDiagram("not json")).toEqual({ error: "That file isn't valid JSON." });
  });
});
