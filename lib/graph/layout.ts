import { DataObject, FlowGraph, FlowNode, NodeKind } from "./types";

const ROW_HEIGHT = 170;
const COLUMN_WIDTH = 300;
const CARD_WIDTH = 220;

// Rough rendered widths (see .fb-node in globals.css), used to centre each
// node on its column rather than aligning their left edges.
const NODE_WIDTHS: Record<NodeKind, number> = {
  start: 32,
  end: 32,
  step: CARD_WIDTH,
  call: CARD_WIDTH,
  decision: 190,
};

type Point = { x: number; y: number };

/**
 * Places nodes top-to-bottom in flow order: each node sits one row below the
 * node that first reaches it, in the same column, except a decision's "no"
 * branch, which steps one column to the right. Loops (edges back to an
 * earlier node) don't move anything.
 */
function layeredPositions(graph: FlowGraph): Map<string, Point> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const cell = new Map<string, { row: number; col: number }>();
  const taken = new Set<string>();
  const place = (id: string, row: number, col: number) => {
    while (taken.has(`${row}:${col}`)) col++;
    taken.add(`${row}:${col}`);
    cell.set(id, { row, col });
  };

  const start = graph.nodes.find((n) => n.data.kind === "start");
  const queue: string[] = [];
  if (start) {
    place(start.id, 0, 0);
    queue.push(start.id);
  }
  while (queue.length) {
    const id = queue.shift()!;
    const { row, col } = cell.get(id)!;
    const outgoing = graph.edges
      .filter((e) => e.source === id && byId.has(e.target))
      .sort((a, b) => (a.label === "no" ? 1 : 0) - (b.label === "no" ? 1 : 0));
    for (const edge of outgoing) {
      if (cell.has(edge.target)) continue;
      place(edge.target, row + 1, edge.label === "no" ? col + 1 : col);
      queue.push(edge.target);
    }
  }

  // Anything Start can't reach goes in a row underneath, so it stays visible.
  const maxRow = Math.max(0, ...Array.from(cell.values(), (c) => c.row));
  graph.nodes.filter((n) => !cell.has(n.id)).forEach((n, i) => place(n.id, maxRow + 1, i));

  const positions = new Map<string, Point>();
  for (const node of graph.nodes) {
    const { row, col } = cell.get(node.id)!;
    positions.set(node.id, {
      x: col * COLUMN_WIDTH + (CARD_WIDTH - NODE_WIDTHS[node.data.kind]) / 2,
      y: row * ROW_HEIGHT,
    });
  }
  return positions;
}

const overlaps = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) < CARD_WIDTH + 20 && Math.abs(a.y - b.y) < ROW_HEIGHT - 30;

/**
 * Gives every node a position. Nodes that also exist in `previous` keep the
 * spot the user left them in, and new nodes are placed relative to the node
 * that leads into them. If that would stack a new node on top of an existing
 * one (e.g. a step inserted mid-flow), the whole diagram is laid out afresh
 * instead, since a clean layout beats a preserved but overlapping one.
 */
export function autoLayout(graph: FlowGraph, previous?: FlowGraph): FlowGraph {
  return placeData(layoutNodes(graph, previous), previous);
}

function layoutNodes(graph: FlowGraph, previous?: FlowGraph): FlowGraph {
  const auto = layeredPositions(graph);
  const withPositions = (pos: Map<string, Point>): FlowGraph => ({
    ...graph,
    nodes: graph.nodes.map((n): FlowNode => ({ ...n, position: pos.get(n.id)! })),
  });

  const kept = new Map((previous?.nodes ?? []).map((n) => [n.id, n.position]));
  if (!graph.nodes.some((n) => kept.has(n.id))) return withPositions(auto);

  const final = new Map<string, Point>();
  graph.nodes.forEach((n) => kept.has(n.id) && final.set(n.id, kept.get(n.id)!));

  // Resolve new nodes in flow order so a parent is always placed before its child.
  const order = [...auto.entries()].sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([id]) => id);
  for (const id of order) {
    if (final.has(id)) continue;
    const parent = graph.edges.find((e) => e.target === id && final.has(e.source))?.source;
    const own = auto.get(id)!;
    const pos = parent
      ? {
          x: final.get(parent)!.x + own.x - auto.get(parent)!.x,
          y: final.get(parent)!.y + own.y - auto.get(parent)!.y,
        }
      : own;
    const collides = [...final.values()].some((p) => overlaps(p, pos));
    if (collides) return withPositions(auto);
    final.set(id, pos);
  }
  return withPositions(final);
}

const TABLE_WIDTH = 220;
const TABLE_GAP = 40;
// Rough rendered height of a data table (see .fb-table in globals.css).
const tableHeight = (d: DataObject) => 64 + 26 * d.fields.length;

/**
 * Gives every data object a spot for its table. Objects keep their own
 * position, or the one the same object (by id, then name) had in `previous`;
 * the rest stack in a column to the left of the flow, under any tables
 * already there.
 */
export function placeData(graph: FlowGraph, previous?: FlowGraph): FlowGraph {
  if (!graph.data?.some((d) => !d.position)) return graph;
  const before = previous?.data ?? [];
  const kept = (d: DataObject) =>
    d.position ?? (before.find((p) => p.id === d.id) ?? before.find((p) => p.name === d.name))?.position;

  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  const x = (xs.length ? Math.min(...xs) : 0) - TABLE_WIDTH - 120;
  let y = ys.length ? Math.min(...ys) : 0;
  for (const d of graph.data) {
    const p = kept(d);
    if (p && Math.abs(p.x - x) < TABLE_WIDTH) y = Math.max(y, p.y + tableHeight(d) + TABLE_GAP);
  }

  return {
    ...graph,
    data: graph.data.map((d) => {
      const p = kept(d);
      if (p) return { ...d, position: p };
      const position = { x, y };
      y += tableHeight(d) + TABLE_GAP;
      return { ...d, position };
    }),
  };
}
