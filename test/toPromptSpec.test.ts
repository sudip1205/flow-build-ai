import { describe, it, expect } from "vitest";
import { toPromptSpec } from "@/lib/graph/toPromptSpec";

describe("toPromptSpec", () => {
  it("renders a simple start->end graph", () => {
    const spec = toPromptSpec({
      nodes: [
        { id: "s", type: "start", position: { x: 0, y: 0 }, data: { kind: "start", label: "Start" } },
        { id: "e", type: "end", position: { x: 0, y: 0 }, data: { kind: "end", label: "End" } },
      ],
      edges: [{ id: "e1", source: "s", target: "e" }],
    });
    expect(spec).toContain("START");
    expect(spec).toContain("END");
  });
});
