export type NodeKind = "start" | "step" | "decision" | "dataStore" | "end";

export interface FlowNodeData {
  kind: NodeKind;
  label: string;
  description?: string;
  condition?: string;
}

export interface FlowNode {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
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

export type TargetLanguage = "python" | "typescript" | "go";
