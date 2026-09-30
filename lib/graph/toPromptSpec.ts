import { FlowGraph, FlowNode, StepAction } from "./types";
import { formatField, parseFields } from "./fields";

/**
 * Converts a validated flow graph into a deterministic, structured text
 * description that we hand to the LLM instead of a picture of the diagram.
 * This is the single most important reliability decision in the app:
 * structured data in, structured code out.
 *
 * Nodes are listed in breadth-first order from Start (so the output doesn't
 * depend on the order they were drawn in), each tagged with its id so edges
 * can refer back to it — including back-edges, which the model renders as loops.
 */
const ACTION_TAGS: Record<StepAction, (resource?: string) => string> = {
  logic: () => "[LOGIC] ",
  api: (resource) => `[REST API CALL${resource ? `: ${resource}` : ""}] `,
  db: (resource) => `[DB CALL${resource ? `: table ${resource}` : ""}] `,
};

export function toPromptSpec(graph: FlowGraph): string {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = (id: string) =>
    graph.edges
      .filter((e) => e.source === id && byId.has(e.target))
      // yes before no, so decision branches always read in the same order
      .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "") * -1);

  const describe = (node: FlowNode) => {
    switch (node.data.kind) {
      case "start":
        return `START`;
      case "end":
        return `END${node.data.label && node.data.label !== "End" ? ` "${node.data.label}"` : ""}`;
      case "step":
        return `STEP ${node.data.action ? ACTION_TAGS[node.data.action](node.data.resource) : ""}"${node.data.label}"${node.data.description ? `: ${node.data.description}` : ""}`;
      case "decision":
        return `DECISION "${node.data.label}"${node.data.condition ? ` (condition: ${node.data.condition})` : ""}${node.data.description ? `: ${node.data.description}` : ""}`;
      case "dataStore": {
        const fields = parseFields(node.data.fields);
        const vars = fields.length ? ` (variables: ${fields.map(formatField).join("; ")})` : "";
        return `DATA "${node.data.label}"${vars}${node.data.description ? `: ${node.data.description}` : ""}`;
      }
      default:
        return node.data.label;
    }
  };

  const start = graph.nodes.find((n) => n.data.kind === "start");
  const order: FlowNode[] = [];
  const seen = new Set<string>();
  const queue = start ? [start] : [];
  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    order.push(node);
    outgoing(node.id).forEach((e) => queue.push(byId.get(e.target)!));
  }
  // Anything not reachable from Start still gets listed, after the main flow.
  graph.nodes.forEach((n) => !seen.has(n.id) && order.push(n));

  const lines: string[] = [];
  order.forEach((node) => {
    lines.push(`- [${node.id}] ${describe(node)}`);
    outgoing(node.id).forEach((edge) => {
      const branch = edge.label ? ` [${edge.label}]` : "";
      lines.push(`    ->${branch} ${edge.target}`);
    });
  });

  return lines.join("\n");
}
