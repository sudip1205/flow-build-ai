import { IDENTIFIER, REFERENCE_KEYS, findReferences, referenceStatus } from "./data";
import { FlowGraph } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateGraph(graph: FlowGraph): ValidationResult {
  const errors: string[] = [];
  const starts = graph.nodes.filter((n) => n.type === "start");
  const ends = graph.nodes.filter((n) => n.type === "end");
  const ids = new Set(graph.nodes.map((n) => n.id));

  if (starts.length !== 1) {
    errors.push(`Expected exactly 1 Start node, found ${starts.length}.`);
  }
  if (ends.length < 1) {
    errors.push("Expected at least 1 End node.");
  }
  if (ids.size !== graph.nodes.length) {
    errors.push("Node ids must be unique.");
  }

  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      errors.push(`Edge "${edge.id}" points to a node that doesn't exist.`);
    }
  }

  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter((e) => e.source === node.id);
    const incoming = graph.edges.filter((e) => e.target === node.id);
    const name = `"${node.data.label}"`;

    switch (node.type) {
      case "start":
        if (incoming.length) errors.push(`Start node can't have incoming edges.`);
        if (outgoing.length !== 1) errors.push(`Start node must have exactly one outgoing edge.`);
        break;
      case "end":
        if (outgoing.length) errors.push(`End node ${name} can't have outgoing edges.`);
        break;
      case "decision": {
        const labels = outgoing.map((e) => e.label);
        const yes = labels.filter((l) => l === "yes").length;
        const no = labels.filter((l) => l === "no").length;
        if (yes !== 1 || no !== 1 || outgoing.length !== 2) {
          errors.push(
            `Decision node ${name} must have exactly one "yes" and one "no" outgoing edge.`
          );
        }
        break;
      }
      default:
        if (outgoing.length !== 1) {
          errors.push(`Node ${name} must have exactly one outgoing edge (found ${outgoing.length}).`);
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

  errors.push(...dataErrors(graph));

  return { valid: errors.length === 0, errors };
}

/** Data object names and fields must be usable as code identifiers, and references must point at real fields. */
function dataErrors(graph: FlowGraph): string[] {
  const errors: string[] = [];
  const data = graph.data ?? [];
  const names = new Set<string>();
  for (const object of data) {
    if (!IDENTIFIER.test(object.name)) {
      errors.push(`Data object name "${object.name}" must be one word: letters, digits and _ only.`);
    }
    if (names.has(object.name)) errors.push(`There are two data objects named "${object.name}".`);
    names.add(object.name);
    const fields = new Set<string>();
    for (const field of object.fields) {
      if (!IDENTIFIER.test(field.name)) {
        errors.push(`Field "${field.name}" in ${object.name} must be one word: letters, digits and _ only.`);
      }
      if (fields.has(field.name)) errors.push(`${object.name} has two fields named "${field.name}".`);
      fields.add(field.name);
    }
  }

  for (const node of graph.nodes) {
    const missing = new Set<string>();
    for (const key of REFERENCE_KEYS) {
      for (const ref of findReferences(node.data[key])) {
        if (referenceStatus(ref, data) === "unknown-field") missing.add(`${ref.name}.${ref.field}`);
      }
    }
    for (const ref of missing) {
      const [name, field] = ref.split(".");
      errors.push(`"${node.data.label}" uses ${ref}, but ${name} has no field "${field}".`);
    }
  }
  return errors;
}
