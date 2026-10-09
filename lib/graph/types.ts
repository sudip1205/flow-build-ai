export const NODE_KINDS = ["start", "step", "call", "decision", "end"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** What a call node talks to; decides which layer of the generated project it lands in. */
export const CALL_TYPES = ["rest", "graphql", "grpc", "db", "queue", "cache", "email", "sdk", "llm"] as const;
export type CallType = (typeof CALL_TYPES)[number];

export interface FlowNodeData {
  kind: NodeKind;
  label: string;
  description?: string;
  condition?: string;
  /** call only: what kind of backend call this is. */
  callType?: CallType;
  /** call only: the verb, e.g. "POST" for REST or "select" for a database. */
  operation?: string;
  /** call only: the endpoint, table, topic, key, method or model it targets. */
  target?: string;
  /** call only: what it sends, usually data references like "Request.accountId". */
  input?: string;
  /** call only: where its result goes, e.g. "Account.status". */
  output?: string;
}

/** How a data object is used: request fields, working state, the response, or settings. */
export const DATA_ROLES = ["input", "state", "output", "config"] as const;
export type DataRole = (typeof DATA_ROLES)[number];

/** Suggested field types; any short type name is accepted. */
export const FIELD_TYPES = ["string", "number", "boolean", "date", "list", "object"] as const;

export interface DataObjectField {
  name: string;
  type?: string;
  value?: string;
}

/**
 * A named group of values kept beside the flow rather than in it. Nodes refer
 * to its fields as Name.field in their text.
 */
export interface DataObject {
  id: string;
  name: string;
  role: DataRole;
  description?: string;
  fields: DataObjectField[];
  /** Where its table sits on the canvas; placed beside the flow when missing. */
  position?: { x: number; y: number };
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
  /** The flow's data objects; not part of the flow itself. */
  data?: DataObject[];
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

export function isCallType(value: unknown): value is CallType {
  return typeof value === "string" && (CALL_TYPES as readonly string[]).includes(value);
}

export function isDataRole(value: unknown): value is DataRole {
  return typeof value === "string" && (DATA_ROLES as readonly string[]).includes(value);
}

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === "string" && (NODE_KINDS as readonly string[]).includes(value);
}
