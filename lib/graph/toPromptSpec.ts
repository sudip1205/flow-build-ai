import { DataObject, FlowGraph, FlowNode } from "./types";
import { formatField } from "./fields";
import { CALL_TYPE_INFO } from "./calls";

/**
 * Converts a validated flow graph into a deterministic, structured text
 * description that we hand to the LLM instead of a picture of the diagram.
 * This is the single most important reliability decision in the app:
 * structured data in, structured code out.
 *
 * Nodes are listed in breadth-first order from Start (so the output doesn't
 * depend on the order they were drawn in), each tagged with its id so edges
 * can refer back to it — including back-edges, which the model renders as loops.
 * Data objects, when there are any, come first in their own section.
 */
function describeCall(node: FlowNode) {
  const { callType = "rest", operation, target, input, output, label, description } = node.data;
  const info = CALL_TYPE_INFO[callType];
  const where = [operation, callType === "db" && target ? `table ${target}` : target].filter(Boolean).join(" ");
  const io = [input && `input: ${input}`, output && `output: ${output}`].filter(Boolean).join("; ");
  return `CALL [${info.tag}${where ? `: ${where}` : ""}] "${label}"${description ? `: ${description}` : ""}${io ? ` (${io})` : ""}`;
}

function describeData(data: DataObject[]): string[] {
  return data.flatMap((d) => [
    `- ${d.name} (${d.role})${d.description ? `: ${d.description}` : ""}`,
    ...d.fields.map((f) => `    ${formatField(f)}`),
  ]);
}

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
        return `STEP "${node.data.label}"${node.data.description ? `: ${node.data.description}` : ""}`;
      case "call":
        return describeCall(node);
      case "decision":
        return `DECISION "${node.data.label}"${node.data.condition ? ` (condition: ${node.data.condition})` : ""}${node.data.description ? `: ${node.data.description}` : ""}`;
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

  const data = graph.data ?? [];
  if (!data.length) return lines.join("\n");
  return ["DATA:", ...describeData(data), "", "FLOW:", ...lines].join("\n");
}
