export interface DataField {
  name: string;
  type?: string;
  value?: string;
}

/**
 * Reads data fields from simple text: "orders: list, total: number = 0, seen = []".
 * Commas inside brackets or quotes stay part of the value, so
 * "limits = [1, 2], greeting = 'hi, there'" is two variables.
 */
export function parseFields(text: string | undefined): DataField[] {
  if (!text) return [];
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    else if ((ch === "," || ch === "\n") && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);

  return parts.map(parseField).filter((f) => f.name);
}

/** Reads one field written as "name: type = value"; the type and value are optional. */
export function parseField(text: string): DataField {
  const eq = text.indexOf("=");
  const head = eq === -1 ? text : text.slice(0, eq);
  const value = eq === -1 ? "" : text.slice(eq + 1).trim();
  const colon = head.indexOf(":");
  const name = (colon === -1 ? head : head.slice(0, colon)).trim();
  const type = colon === -1 ? "" : head.slice(colon + 1).trim();
  return { name, ...(type ? { type } : {}), ...(value ? { value } : {}) };
}

export const formatField = (f: DataField) => `${f.name}${f.type ? `: ${f.type}` : ""}${f.value ? ` = ${f.value}` : ""}`;

/** The canonical way a list of fields is written as text. */
export const formatFields = (fields: DataField[]) => fields.map(formatField).join(", ");
