import { describe, expect, it } from "vitest";
import { autoLayout, placeData } from "@/lib/graph/layout";
import { parseGraph } from "@/lib/graph/parse";
import { toPromptSpec } from "@/lib/graph/toPromptSpec";
import { EXAMPLE_DIAGRAM } from "@/lib/examples";
import { DataObject, FlowGraph } from "@/lib/graph/types";
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

describe("data set tables", () => {
  const object = (id: string, name: string, extra: Partial<DataObject> = {}): DataObject => ({
    id,
    name,
    role: "state",
    fields: [{ name: "x" }],
    ...extra,
  });
  const flow = graph([{ ...node("s", "start"), position: { x: 100, y: 50 } }], []);

  it("stacks unplaced tables in a column left of the flow", () => {
    const out = placeData({ ...flow, data: [object("a", "A"), object("b", "B")] });
    const [a, b] = out.data!.map((d) => d.position!);
    expect(a.x).toBeLessThan(100);
    expect(a.y).toBe(50);
    expect(b.x).toBe(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it("keeps a table's own position, or the one it had before by id or name", () => {
    const previous = { ...flow, data: [object("old", "B", { position: { x: 7, y: 8 } })] };
    const out = placeData({ ...flow, data: [object("a", "A", { position: { x: 1, y: 2 } }), object("new", "B")] }, previous);
    expect(out.data!.map((d) => d.position)).toEqual([
      { x: 1, y: 2 },
      { x: 7, y: 8 },
    ]);
  });

  it("autoLayout places tables too", () => {
    const out = autoLayout({ ...flow, data: [object("a", "A")] });
    expect(out.data![0].position).toBeDefined();
  });

  it("table positions survive parsing and stay out of the codegen spec", () => {
    const g = { ...flow, data: [object("a", "A", { position: { x: -300, y: 20 } })] };
    const parsed = parseGraph(g);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.graph.data![0].position).toEqual({ x: -300, y: 20 });
    expect(toPromptSpec(parsed.graph)).not.toContain("-300");
  });
});
