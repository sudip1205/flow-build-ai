import { parseGraph } from "./parse";
import { FlowGraph } from "./types";

/** Marks clipboard text as FlowBuild nodes, so pasting other text is ignored. */
const CLIP_MARKER = "flowbuild/nodes";

const PASTE_OFFSET = 40;

/**
 * The chosen nodes plus the edges running between them. Start is left out:
 * a diagram has exactly one, so a copy of it could never be pasted validly.
 */
export function copyNodes(graph: FlowGraph, ids: Iterable<string>): FlowGraph {
  const wanted = new Set(ids);
  const nodes = graph.nodes.filter((n) => wanted.has(n.id) && n.data.kind !== "start");
  const kept = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => kept.has(e.source) && kept.has(e.target));
  return { nodes, edges };
}

/**
 * Fresh copies of the clipboard's nodes, given new ids and shifted down-right
 * so they don't land exactly on top of the originals. Edges between them are
 * rewired to the new ids.
 */
export function pasteNodes(clip: FlowGraph, makeId: () => string): FlowGraph {
  const ids = new Map(clip.nodes.map((n) => [n.id, makeId()]));
  return {
    nodes: clip.nodes.map((n) => ({
      ...n,
      id: ids.get(n.id)!,
      position: { x: n.position.x + PASTE_OFFSET, y: n.position.y + PASTE_OFFSET },
      data: { ...n.data },
    })),
    edges: clip.edges.map((e) => {
      const source = ids.get(e.source)!;
      const target = ids.get(e.target)!;
      return { ...e, id: `${source}->${target}${e.label ? `:${e.label}` : ""}`, source, target };
    }),
  };
}

/** Clipboard text for copied nodes, so they can be pasted into another tab. */
export function serializeClip(clip: FlowGraph): string {
  return JSON.stringify({ [CLIP_MARKER]: 1, ...clip });
}

/** The copied nodes in clipboard text, or null if it's anything else. */
export function deserializeClip(text: string): FlowGraph | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null || !(CLIP_MARKER in json)) return null;
  const parsed = parseGraph(json);
  if ("error" in parsed) return null;
  return copyNodes(parsed.graph, parsed.graph.nodes.map((n) => n.id));
}
