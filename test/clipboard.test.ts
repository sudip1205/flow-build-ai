import { describe, expect, it } from "vitest";
import { copyNodes, deserializeClip, pasteNodes, serializeClip } from "@/lib/graph/clipboard";
import { edge, graph, node } from "./fixtures";

const flow = graph(
  [node("s", "start"), node("d", "decision"), node("a", "step", { description: "do it" }), node("e", "end")],
  [edge("s", "d"), edge("d", "a", "yes"), edge("d", "e", "no"), edge("a", "d")]
);

describe("copyNodes", () => {
  it("keeps edges between copied nodes and drops the rest", () => {
    const clip = copyNodes(flow, ["d", "a"]);
    expect(clip.nodes.map((n) => n.id)).toEqual(["d", "a"]);
    expect(clip.edges.map((e) => e.id)).toEqual(["d->a:yes", "a->d"]);
  });

  it("never copies Start", () => {
    expect(copyNodes(flow, ["s", "e"]).nodes.map((n) => n.id)).toEqual(["e"]);
  });
});

describe("pasteNodes", () => {
  it("gives new ids, rewires edges and offsets positions", () => {
    let i = 0;
    const pasted = pasteNodes(copyNodes(flow, ["d", "a"]), () => `new${++i}`);
    expect(pasted.nodes.map((n) => [n.id, n.position])).toEqual([
      ["new1", { x: 40, y: 40 }],
      ["new2", { x: 40, y: 40 }],
    ]);
    expect(pasted.edges.map((e) => [e.id, e.source, e.target, e.label])).toEqual([
      ["new1->new2:yes", "new1", "new2", "yes"],
      ["new2->new1", "new2", "new1", undefined],
    ]);
    expect(pasted.nodes[1].data).toEqual(flow.nodes[2].data);
    expect(pasted.nodes[1].data).not.toBe(flow.nodes[2].data);
  });
});

describe("clipboard text", () => {
  it("round-trips copied nodes, including sizes", () => {
    const sized = graph([{ ...node("a", "step"), size: { width: 300, height: 120 } }], []);
    expect(deserializeClip(serializeClip(sized))).toEqual(sized);
  });

  it("ignores ordinary text and diagram files", () => {
    expect(deserializeClip("hello")).toBeNull();
    expect(deserializeClip(JSON.stringify(flow))).toBeNull();
  });
});
