import { describe, it, expect } from "vitest";
import { validateGraph } from "@/lib/graph/validate";
import { EXAMPLE_DIAGRAM } from "@/lib/examples";
import { edge, graph, node } from "./fixtures";

describe("validateGraph", () => {
  it("requires exactly one start node", () => {
    const result = validateGraph({ nodes: [], edges: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Start node/);
  });

  it("passes for minimal valid graph", () => {
    const result = validateGraph(graph([node("s", "start"), node("e", "end")], [edge("s", "e")]));
    expect(result.valid).toBe(true);
  });

  it("passes for the bundled example, which contains a loop", () => {
    expect(validateGraph(EXAMPLE_DIAGRAM)).toEqual({ valid: true, errors: [] });
  });

  it("requires yes/no branches on decision nodes", () => {
    const result = validateGraph(
      graph([node("s", "start"), node("d", "decision"), node("e", "end")], [edge("s", "d"), edge("d", "e")])
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("yes"))).toBe(true);
  });

  it("rejects a decision with two yes branches", () => {
    const result = validateGraph(
      graph(
        [node("s", "start"), node("d", "decision"), node("a", "end"), node("b", "end")],
        [edge("s", "d"), edge("d", "a", "yes"), edge("d", "b", "yes")]
      )
    );
    expect(result.valid).toBe(false);
  });

  it("rejects a step with no way out", () => {
    const result = validateGraph(
      graph([node("s", "start"), node("x", "step"), node("e", "end")], [edge("s", "x")])
    );
    expect(result.errors.some((e) => e.includes('"x"'))).toBe(true);
    // and the End is unreachable
    expect(result.errors.some((e) => e.startsWith("Unreachable"))).toBe(true);
  });

  it("rejects edges out of End and into Start", () => {
    const result = validateGraph(
      graph([node("s", "start"), node("e", "end")], [edge("s", "e"), edge("e", "s")])
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Start node can't have incoming edges.",
        'End node "e" can\'t have outgoing edges.',
      ])
    );
  });

  it("rejects edges to nodes that don't exist", () => {
    const result = validateGraph(
      graph([node("s", "start"), node("e", "end")], [edge("s", "e"), edge("s", "ghost")])
    );
    expect(result.errors.some((e) => e.includes("doesn't exist"))).toBe(true);
  });
});
