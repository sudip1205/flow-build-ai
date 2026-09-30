import { FlowEdge, FlowGraph, FlowNode, NodeKind } from "@/lib/graph/types";

export const node = (id: string, kind: NodeKind, extra: Partial<FlowNode["data"]> = {}): FlowNode => ({
  id,
  type: kind,
  position: { x: 0, y: 0 },
  data: { kind, label: extra.label ?? id, ...extra },
});

export const edge = (source: string, target: string, label?: string): FlowEdge => ({
  id: `${source}->${target}${label ? `:${label}` : ""}`,
  source,
  target,
  label,
});

export const graph = (nodes: FlowNode[], edges: FlowEdge[]): FlowGraph => ({ nodes, edges });
