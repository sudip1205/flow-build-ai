import { parseGraph } from "./graph/parse";
import { FlowGraph, TargetLanguage, isTargetLanguage } from "./graph/types";

export const DIAGRAM_STORAGE_KEY = "flowbuild-ai:diagram";
export const SETTINGS_STORAGE_KEY = "flowbuild-ai:provider";

const FORMAT = "flowbuild-ai/diagram";
const VERSION = 1;

export interface SavedDiagram {
  graph: FlowGraph;
  language: TargetLanguage;
}

export function serializeDiagram(diagram: SavedDiagram): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, ...diagram }, null, 2);
}

/** Parses a saved/exported diagram; returns an error message instead of throwing. */
export function deserializeDiagram(text: string): SavedDiagram | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "That file isn't valid JSON." };
  }
  if (typeof raw !== "object" || raw === null || (raw as { format?: unknown }).format !== FORMAT) {
    return { error: "That file isn't a FlowBuild-AI diagram." };
  }
  const { graph, language } = raw as { graph?: unknown; language?: unknown };
  const parsed = parseGraph(graph);
  if ("error" in parsed) return parsed;
  return { graph: parsed.graph, language: isTargetLanguage(language) ? language : "python" };
}

// Storage can be unavailable (private mode, blocked cookies); never let that break the app.
export function readStorage(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(storage: "local" | "session", key: string, value: string | null) {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // ignore
  }
}
