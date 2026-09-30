import { describe, expect, it } from "vitest";
import { autoLayout } from "@/lib/graph/layout";
import { EXAMPLE_DIAGRAM } from "@/lib/examples";
import { FlowGraph } from "@/lib/graph/types";
import { edge, graph, node } from "./fixtures";

const pos = (g: FlowGraph, id: string) => g.nodes.find((n) => n.id === id)!.position;

describe("autoLayout", () => {
  const flow = graph(
    [node("s", "start"), node("d", "decision"), node("a", "step"), node("e", "end")],
    [edge("s", "d"), edge("d", "a", "yes"), edge("d", "e", "no"), edge("a", "d")]
  );

  it("stacks the flow top to bottom and puts the no branch to the right", () => {
    const out = autoLayout(flow);
    expect(pos(out, "s").y).toBeLessThan(pos(out, "d").y);
    expect(pos(out, "d").y).toBeLessThan(pos(out, "a").y);
    expect(pos(out, "e").x).toBeGreaterThan(pos(out, "a").x);
  });

  it("keeps positions of nodes the user already placed", () => {
    const moved = EXAMPLE_DIAGRAM.nodes.map((n) => ({ ...n, position: { x: n.position.x + 1000, y: n.position.y } }));
    const out = autoLayout({ ...EXAMPLE_DIAGRAM, nodes: moved }, { ...EXAMPLE_DIAGRAM, nodes: moved });
    expect(out.nodes.map((n) => n.position)).toEqual(moved.map((n) => n.position));
  });

  it("places a new node below its parent when there is room", () => {
    const before = graph([{ ...node("s", "start"), position: { x: 500, y: 40 } }], []);
    const after = graph([node("s", "start"), node("e", "end")], [edge("s", "e")]);
    const out = autoLayout(after, before);
    expect(pos(out, "s")).toEqual({ x: 500, y: 40 });
    expect(pos(out, "e").y).toBeGreaterThan(40);
    expect(pos(out, "e").x).toBe(500);
  });

  it("re-lays out everything when a new node would land on an existing one", () => {
    const before = graph(
      [
        { ...node("s", "start"), position: { x: 0, y: 0 } },
        { ...node("e", "end"), position: { x: 0, y: 170 } },
      ],
      [edge("s", "e")]
    );
    const after = graph([node("s", "start"), node("mid", "step"), node("e", "end")], [edge("s", "mid"), edge("mid", "e")]);
    const out = autoLayout(after, before);
    expect(pos(out, "e").y).toBeGreaterThan(pos(out, "mid").y);
  });
});
