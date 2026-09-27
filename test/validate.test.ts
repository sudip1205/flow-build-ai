import { describe, it, expect } from "vitest";
import { validateGraph } from "@/lib/graph/validate";

describe("validateGraph", () => {
  it("requires exactly one start node", () => {
    const result = validateGraph({ nodes: [], edges: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Start node/);
  });

  it("passes for a minimal valid graph", () => {
    const result = validateGraph({
      nodes: [
        { id: "s", type: "start", position: { x: 0, y: 0 }, data: { kind: "start", label: "Start" } },
        { id: "e", type: "end", position: { x: 0, y: 0 }, data: { kind: "end", label: "End" } },
      ],
      edges: [{ id: "e1", source: "s", target: "e" }],
    });
    expect(result.valid).toBe(true);
  });

  it("requires yes/no branches on decision nodes", () => {
    const result = validateGraph({
      nodes: [
        { id: "s", type: "start", position: { x: 0, y: 0 }, data: { kind: "start", label: "Start" } },
        { id: "d", type: "decision", position: { x: 0, y: 0 }, data: { kind: "decision", label: "Check" } },
        { id: "e", type: "end", position: { x: 0, y: 0 }, data: { kind: "end", label: "End" } },
      ],
      edges: [
        { id: "e1", source: "s", target: "d" },
        { id: "e2", source: "d", target: "e" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("yes"))).toBe(true);
  });
});
