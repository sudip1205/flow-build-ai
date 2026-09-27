import { FlowGraph, FlowNode } from "./types";

/**
 * Converts a validated flow graph into a deterministic, structured text
 * description that we hand to the LLM instead of a picture of the diagram.
 * This is the single most important reliability decision in the app:
 * structured data in, structured code out.
 */
export function toPromptSpec(graph: FlowGraph): string {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const lines: string[] = [];

  const describe = (node: FlowNode) => {
    switch (node.data.kind) {
      case "start":
        return `START`;
      case "end":
        return `END`;
      case "step":
        return `STEP "${node.data.label}"${node.data.description ? `: ${node.data.description}` : ""}`;
      case "decision":
        return `DECISION "${node.data.label}"${node.data.condition ? ` (condition: ${node.data.condition})` : ""}`;
      case "dataStore":
        return `DATA "${node.data.label}"${node.data.description ? `: ${node.data.description}` : ""}`;
      default:
        return node.data.label;
    }
  };

  graph.nodes.forEach((node) => {
    const outgoing = graph.edges.filter((e) => e.source === node.id);
    lines.push(`- ${describe(node)}`);
    outgoing.forEach((edge) => {
      const target = byId.get(edge.target);
      if (!target) return;
      const branch = edge.label ? ` [${edge.label}]` : "";
      lines.push(`    ->${branch} ${describe(target)} (id: ${target.id})`);
    });
  });

  return lines.join("\n");
}
