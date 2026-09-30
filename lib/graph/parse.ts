import { FlowEdge, FlowGraph, FlowNode, isNodeKind, isStepAction } from "./types";

const MAX_NODES = 200;
const MAX_EDGES = 400;
const MAX_TEXT = 500;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const MAX_SIZE = 2000;

const dimension = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), MAX_SIZE) : undefined;

const optionalText = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.slice(0, MAX_TEXT) : undefined;

/**
 * Turns untrusted JSON (a request body or an imported file) into a FlowGraph,
 * or explains why it can't. Structural rules (Start count, decision branches,
 * reachability) are validateGraph's job; this only checks the shape.
 */
export function parseGraph(input: unknown): { graph: FlowGraph } | { error: string } {
  if (!isObject(input) || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    return { error: "Graph must be an object with `nodes` and `edges` arrays." };
  }
  if (input.nodes.length > MAX_NODES || input.edges.length > MAX_EDGES) {
    return { error: `Graph is too large (max ${MAX_NODES} nodes, ${MAX_EDGES} edges).` };
  }

  const nodes: FlowNode[] = [];
  for (const raw of input.nodes) {
    if (!isObject(raw) || typeof raw.id !== "string" || !isObject(raw.data)) {
      return { error: "Every node needs a string `id` and a `data` object." };
    }
    const kind = raw.data.kind;
    if (!isNodeKind(kind)) {
      return { error: `Node "${raw.id}" has an unknown kind.` };
    }
    const position = isObject(raw.position) ? raw.position : {};
    const width = isObject(raw.size) ? dimension(raw.size.width) : undefined;
    const height = isObject(raw.size) ? dimension(raw.size.height) : undefined;
    nodes.push({
      id: raw.id,
      type: kind,
      position: {
        x: typeof position.x === "number" ? position.x : 0,
        y: typeof position.y === "number" ? position.y : 0,
      },
      ...(width && height ? { size: { width, height } } : {}),
      data: {
        kind,
        label: optionalText(raw.data.label) ?? kind,
        description: optionalText(raw.data.description),
        condition: optionalText(raw.data.condition),
        fields: kind === "dataStore" ? optionalText(raw.data.fields) : undefined,
        action: kind === "step" && isStepAction(raw.data.action) ? raw.data.action : undefined,
        resource: kind === "step" ? optionalText(raw.data.resource) : undefined,
      },
    });
  }

  const edges: FlowEdge[] = [];
  for (const raw of input.edges) {
    if (
      !isObject(raw) ||
      typeof raw.id !== "string" ||
      typeof raw.source !== "string" ||
      typeof raw.target !== "string"
    ) {
      return { error: "Every edge needs string `id`, `source` and `target`." };
    }
    edges.push({
      id: raw.id,
      source: raw.source,
      target: raw.target,
      label: optionalText(raw.label),
    });
  }

  return { graph: { nodes, edges } };
}
