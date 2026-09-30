export const NODE_KINDS = ["start", "step", "decision", "dataStore", "end"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** What a step does, which decides where its code lives in the generated project. */
export const STEP_ACTIONS = ["logic", "api", "db"] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];

export interface FlowNodeData {
  kind: NodeKind;
  label: string;
  description?: string;
  condition?: string;
  /** dataStore only: the variables it holds, e.g. "orders, total = 0". */
  fields?: string;
  /** step only: unset means the model infers it from the label and description. */
  action?: StepAction;
  /** step only: the endpoint of an api step ("POST /v1/accounts") or the table of a db step. */
  resource?: string;
}

export interface FlowNode {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  /** Set when the user has resized the node; otherwise it fits its content. */
  size?: { width: number; height: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const TARGET_LANGUAGES = ["python", "typescript", "go", "java"] as const;
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<TargetLanguage, string> = {
  python: "Python",
  typescript: "TypeScript",
  go: "Go",
  java: "Java",
};

export function isTargetLanguage(value: unknown): value is TargetLanguage {
  return typeof value === "string" && (TARGET_LANGUAGES as readonly string[]).includes(value);
}

export function isStepAction(value: unknown): value is StepAction {
  return typeof value === "string" && (STEP_ACTIONS as readonly string[]).includes(value);
}

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === "string" && (NODE_KINDS as readonly string[]).includes(value);
}
