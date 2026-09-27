import { FlowGraph } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateGraph(graph: FlowGraph): ValidationResult {
  const errors: string[] = [];
  const starts = graph.nodes.filter((n) => n.type === "start");
  const ends = graph.nodes.filter((n) => n.type === "end");

  if (starts.length !== 1) {
    errors.push(`Expected exactly 1 Start node, found ${starts.length}.`);
  }
  if (ends.length < 1) {
    errors.push("Expected at least 1 End node.");
  }

  for (const node of graph.nodes) {
    if (node.type === "decision") {
      const outgoing = graph.edges.filter((e) => e.source === node.id);
      const labels = outgoing.map((e) => e.label);
      if (!labels.includes("yes") || !labels.includes("no")) {
        errors.push(
          `Decision node "${node.data.label}" must have exactly one "yes" and one "no" outgoing edge.`
        );
      }
    }
  }

  if (starts.length === 1) {
    const visited = new Set<string>();
    const stack = [starts[0].id];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      graph.edges
        .filter((e) => e.source === current)
        .forEach((e) => stack.push(e.target));
    }
    const unreachable = graph.nodes.filter((n) => !visited.has(n.id));
    if (unreachable.length) {
      errors.push(
        `Unreachable node(s) from Start: ${unreachable.map((n) => n.data.label).join(", ")}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
