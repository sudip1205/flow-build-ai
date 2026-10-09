import { DataObject, FlowNodeData } from "./types";

/** A data object's name, and its fields' names: letters, digits and underscores. */
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const REFERENCE = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

export interface DataReference {
  name: string;
  field: string;
  index: number;
  length: number;
}

/** Every Name.field in a piece of text, whether or not Name is a data object. */
export function findReferences(text: string | undefined): DataReference[] {
  if (!text) return [];
  return Array.from(text.matchAll(REFERENCE), (m) => ({
    name: m[1],
    field: m[2],
    index: m.index ?? 0,
    length: m[0].length,
  }));
}

/** The text fields of a node that may hold data references. */
export const REFERENCE_KEYS = ["label", "description", "condition", "target", "input", "output"] as const;

/**
 * How a reference relates to the data objects: a known field, a field the
 * object doesn't have, or no data object at all (a loop variable like
 * order.amount, which is fine).
 */
export function referenceStatus(ref: DataReference, data: DataObject[]): "ok" | "unknown-field" | "not-data" {
  const object = data.find((d) => d.name === ref.name);
  if (!object) return "not-data";
  return object.fields.some((f) => f.name === ref.field) ? "ok" : "unknown-field";
}

/** Turns a label like "Order state" into a usable data object name, "OrderState". */
export function toIdentifier(label: string, fallback = "Data"): string {
  const words = label.match(/[A-Za-z0-9_]+/g) ?? [];
  const joined = words.length > 1 ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join("") : (words[0] ?? "");
  if (!joined) return fallback;
  return /^[0-9]/.test(joined) ? `_${joined}` : joined;
}

/** A data set, or one of its fields, as named in references. */
export type Rename = { name: string; field?: string };

/** The base name, or the base with the first number that isn't taken. */
export const uniqueName = (base: string, taken: string[]) => {
  let name = base;
  for (let n = 2; taken.includes(name); n++) name = `${base}${n}`;
  return name;
};

/**
 * Rewrites references after a rename: Old.x becomes New.x, or with a field
 * rename, Name.old becomes Name.new.
 */
export function renameInText(
  text: string,
  from: { name: string; field?: string },
  to: { name: string; field?: string }
) {
  return text.replace(REFERENCE, (match, name: string, field: string) => {
    if (name !== from.name) return match;
    if (from.field === undefined) return `${to.name}.${field}`;
    return field === from.field ? `${to.name}.${to.field}` : match;
  });
}

/** Applies renameInText to every reference-bearing text of a node; returns null when nothing changed. */
export function renameInNode(
  data: FlowNodeData,
  from: { name: string; field?: string },
  to: { name: string; field?: string }
): Partial<FlowNodeData> | null {
  const patch: Partial<FlowNodeData> = {};
  for (const key of REFERENCE_KEYS) {
    const text = data[key];
    if (!text) continue;
    const next = renameInText(text, from, to);
    if (next !== text) patch[key] = next;
  }
  return Object.keys(patch).length ? patch : null;
}
