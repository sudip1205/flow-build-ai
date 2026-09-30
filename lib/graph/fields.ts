export interface DataField {
  name: string;
  value?: string;
}

/**
 * Reads a dataStore's variables from simple text: "orders, total = 0, seen = []".
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

  return parts
    .map((part) => {
      const eq = part.indexOf("=");
      const name = (eq === -1 ? part : part.slice(0, eq)).trim();
      const value = eq === -1 ? "" : part.slice(eq + 1).trim();
      return value ? { name, value } : { name };
    })
    .filter((f) => f.name);
}

export const formatField = (f: DataField) => (f.value ? `${f.name} = ${f.value}` : f.name);

/** The canonical way a list of variables is stored and shown for editing. */
export const formatFields = (fields: DataField[]) => fields.map(formatField).join(", ");
