import { FlowGraph } from "./graph/types";

/** Starting point for a fresh canvas. */
export const EMPTY_DIAGRAM: FlowGraph = {
  nodes: [
    { id: "start", type: "start", position: { x: 200, y: 0 }, data: { kind: "start", label: "Start" } },
    { id: "end", type: "end", position: { x: 200, y: 300 }, data: { kind: "end", label: "End" } },
  ],
  edges: [],
};

/** A small but complete flow (data, a loop, a decision) to show what the tool does. */
export const EXAMPLE_DIAGRAM: FlowGraph = {
  nodes: [
    { id: "start", type: "start", position: { x: 290, y: 0 }, data: { kind: "start", label: "Start" } },
    {
      id: "orders",
      type: "dataStore",
      position: { x: 190, y: 90 },
      data: { kind: "dataStore", label: "orders", description: "list of orders, each with an amount and a status" },
    },
    {
      id: "total",
      type: "dataStore",
      position: { x: 190, y: 280 },
      data: { kind: "dataStore", label: "total", description: "running total, starts at 0" },
    },
    {
      id: "more",
      type: "decision",
      position: { x: 210, y: 450 },
      data: { kind: "decision", label: "More orders?", condition: "there is a next order in orders" },
    },
    {
      id: "paid",
      type: "decision",
      position: { x: 20, y: 640 },
      data: { kind: "decision", label: "Is it paid?", condition: "order.status == 'paid'" },
    },
    {
      id: "add",
      type: "step",
      position: { x: -200, y: 830 },
      data: { kind: "step", label: "Add to total", description: "total += order.amount" },
    },
    {
      id: "report",
      type: "step",
      position: { x: 480, y: 640 },
      data: { kind: "step", label: "Return total", description: "return the total of paid orders" },
    },
    { id: "end", type: "end", position: { x: 584, y: 830 }, data: { kind: "end", label: "End" } },
  ],
  edges: [
    { id: "e1", source: "start", target: "orders" },
    { id: "e2", source: "orders", target: "total" },
    { id: "e3", source: "total", target: "more" },
    { id: "e4", source: "more", target: "paid", label: "yes" },
    { id: "e5", source: "more", target: "report", label: "no" },
    { id: "e6", source: "paid", target: "add", label: "yes" },
    { id: "e7", source: "paid", target: "more", label: "no" },
    { id: "e8", source: "add", target: "more" },
    { id: "e9", source: "report", target: "end" },
  ],
};
