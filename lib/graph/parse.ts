import { parseFields } from "./fields";
import { toIdentifier } from "./data";
import {
  CallType,
  DataObject,
  DataObjectField,
  FlowEdge,
  FlowGraph,
  FlowNode,
  isCallType,
  isDataRole,
  isNodeKind,
} from "./types";

const MAX_NODES = 200;
const MAX_EDGES = 400;
const MAX_TEXT = 500;
const MAX_DATA = 50;
const MAX_FIELDS = 50;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const MAX_SIZE = 2000;

const dimension = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), MAX_SIZE) : undefined;

const isPoint = (v: unknown): v is { x: number; y: number } =>
  isObject(v) && Number.isFinite(v.x) && Number.isFinite(v.y);

const optionalText = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.slice(0, MAX_TEXT) : undefined;

// Diagrams saved before data objects and call nodes existed tagged backend
// calls on steps instead.
const LEGACY_CALL_TYPES: Record<string, CallType> = { api: "rest", db: "db" };

type LegacyData = { id: string; label: string; description?: string; fields?: string };

/** A data object's fields, from a list of {name, type, value} or the text form "a: string, b = 0". */
function parseDataFields(raw: unknown): DataObjectField[] {
  const list = typeof raw === "string" ? parseFields(raw) : Array.isArray(raw) ? raw : [];
  const fields: DataObjectField[] = [];
  for (const f of list.slice(0, MAX_FIELDS)) {
    if (typeof f === "string") {
      fields.push(...parseFields(f));
      continue;
    }
    if (!isObject(f)) continue;
    const name = optionalText(f.name)?.trim();
    if (!name) continue;
    const type = optionalText(f.type)?.trim();
    const value = optionalText(f.value)?.trim();
    fields.push({ name, ...(type ? { type } : {}), ...(value ? { value } : {}) });
  }
  return fields.slice(0, MAX_FIELDS);
}

function parseData(raw: unknown[]): DataObject[] | { error: string } {
  if (raw.length > MAX_DATA) return { error: `Too many data objects (max ${MAX_DATA}).` };
  const data: DataObject[] = [];
  for (const [i, d] of raw.entries()) {
    if (!isObject(d) || !optionalText(d.name)) return { error: "Every data object needs a `name`." };
    data.push({
      id: typeof d.id === "string" && d.id ? d.id : `data_${i + 1}`,
      name: optionalText(d.name)!.trim(),
      role: isDataRole(d.role) ? d.role : "state",
      description: optionalText(d.description),
      fields: parseDataFields(d.fields),
      ...(isPoint(d.position) ? { position: { x: d.position.x, y: d.position.y } } : {}),
    });
  }
  return data;
}

/**
 * Old dataStore nodes become data objects: one with variables keeps its name
 * and variables; single-variable ones are gathered into one "State" object.
 */
function migrateLegacyData(legacy: LegacyData[], taken: Set<string>): DataObject[] {
  const unique = (base: string) => {
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}${n}`;
    taken.add(name);
    return name;
  };
  const objects: DataObject[] = [];
  const loose: LegacyData[] = [];
  for (const d of legacy) {
    const fields = parseFields(d.fields);
    if (!fields.length) {
      loose.push(d);
      continue;
    }
    objects.push({ id: d.id, name: unique(toIdentifier(d.label)), role: "state", description: d.description, fields });
  }
  if (loose.length) {
    const notes = loose.filter((d) => d.description).map((d) => `${toIdentifier(d.label, "value")}: ${d.description}`);
    objects.unshift({
      id: loose[0].id,
      name: unique("State"),
      role: "state",
      description: notes.length ? notes.join("; ").slice(0, MAX_TEXT) : undefined,
      fields: loose.map((d) => ({ name: toIdentifier(d.label, "value") })),
    });
  }
  return objects;
}

/** Drops removed nodes from the flow, joining each one's incoming edges to where it led. */
function bypass(edges: FlowEdge[], removed: Set<string>): FlowEdge[] {
  const resolve = (id: string) => {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current && removed.has(current) && !seen.has(current)) {
      seen.add(current);
      current = edges.find((e) => e.source === current)?.target;
    }
    return current && !removed.has(current) ? current : undefined;
  };
  return edges.flatMap((e) => {
    if (removed.has(e.source)) return [];
    const target = resolve(e.target);
    return target ? [{ ...e, target }] : [];
  });
}

/**
 * Turns untrusted JSON (a request body or an imported file) into a FlowGraph,
 * or explains why it can't. Structural rules (Start count, decision branches,
 * reachability) are validateGraph's job; this only checks shape, and upgrades
 * diagrams saved in older formats.
 */
export function parseGraph(input: unknown): { graph: FlowGraph } | { error: string } {
  if (!isObject(input) || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    return { error: "Graph must be an object with `nodes` and `edges` arrays." };
  }
  if (input.nodes.length > MAX_NODES || input.edges.length > MAX_EDGES) {
    return { error: `Graph is too large (max ${MAX_NODES} nodes, ${MAX_EDGES} edges).` };
  }

  const nodes: FlowNode[] = [];
  const legacyData: LegacyData[] = [];
  for (const raw of input.nodes) {
    if (!isObject(raw) || typeof raw.id !== "string" || !isObject(raw.data)) {
      return { error: "Every node needs a string `id` and a `data` object." };
    }
    if (raw.data.kind === "dataStore") {
      legacyData.push({
        id: raw.id,
        label: optionalText(raw.data.label) ?? raw.id,
        description: optionalText(raw.data.description),
        fields: optionalText(raw.data.fields),
      });
      continue;
    }
    const legacyCall = raw.data.kind === "step" ? LEGACY_CALL_TYPES[String(raw.data.action)] : undefined;
    const kind = legacyCall ? "call" : raw.data.kind;
    if (!isNodeKind(kind)) {
      return { error: `Node "${raw.id}" has an unknown kind.` };
    }
    const position = isObject(raw.position) ? raw.position : {};
    const width = isObject(raw.size) ? dimension(raw.size.width) : undefined;
    const height = isObject(raw.size) ? dimension(raw.size.height) : undefined;
    const call = kind === "call";
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
        ...(call
          ? {
              callType: legacyCall ?? (isCallType(raw.data.callType) ? raw.data.callType : "rest"),
              operation: optionalText(raw.data.operation),
              target: optionalText(raw.data.target) ?? optionalText(raw.data.resource),
              input: optionalText(raw.data.input),
              output: optionalText(raw.data.output),
            }
          : {}),
      },
    });
  }

  let edges: FlowEdge[] = [];
  for (const raw of input.edges) {
    if (
      !isObject(raw) ||
      typeof raw.id !== "string" ||
      typeof raw.source !== "string" ||
      typeof raw.target !== "string"
    ) {
      return { error: "Every edge needs a string `id`, `source` and `target`." };
    }
    edges.push({
      id: raw.id,
      source: raw.source,
      target: raw.target,
      label: optionalText(raw.label),
    });
  }

  let data: DataObject[] | undefined;
  if (input.data !== undefined) {
    if (!Array.isArray(input.data)) return { error: "`data` must be an array." };
    const parsed = parseData(input.data);
    if ("error" in parsed) return parsed;
    data = parsed;
  }
  if (legacyData.length) {
    edges = bypass(edges, new Set(legacyData.map((d) => d.id)));
    data = [...(data ?? []), ...migrateLegacyData(legacyData, new Set((data ?? []).map((d) => d.name)))];
  }

  return { graph: { nodes, edges, ...(data ? { data } : {}) } };
}
