import { FlowGraph } from "./graph/types";

/** Starting point for a fresh canvas. */
export const EMPTY_DIAGRAM: FlowGraph = {
  nodes: [
    { id: "start", type: "start", position: { x: 200, y: 0 }, data: { kind: "start", label: "Start" } },
    { id: "end", type: "end", position: { x: 200, y: 300 }, data: { kind: "end", label: "End" } },
  ],
  edges: [],
};

/** A small but complete flow (data, a backend call, a loop, decisions) to show what the tool does. */
export const EXAMPLE_DIAGRAM: FlowGraph = {
  data: [
    {
      id: "request",
      name: "Request",
      role: "input",
      description: "who to total orders for",
      fields: [{ name: "customerId", type: "string" }],
    },
    {
      id: "totals",
      name: "Totals",
      role: "state",
      fields: [
        { name: "orders", type: "list" },
        { name: "total", type: "number", value: "0" },
      ],
    },
    {
      id: "response",
      name: "Response",
      role: "output",
      fields: [{ name: "total", type: "number" }],
    },
  ],
  nodes: [
    { id: "start", type: "start", position: { x: 290, y: 0 }, data: { kind: "start", label: "Start" } },
    {
      id: "load",
      type: "call",
      position: { x: 190, y: 90 },
      data: {
        kind: "call",
        label: "Load orders",
        description: "the customer's orders, each with an amount and status",
        callType: "db",
        operation: "select",
        target: "orders",
        input: "Request.customerId",
        output: "Totals.orders",
      },
    },
    {
      id: "more",
      type: "decision",
      position: { x: 210, y: 300 },
      data: { kind: "decision", label: "More orders?", condition: "there is a next order in Totals.orders" },
    },
    {
      id: "paid",
      type: "decision",
      position: { x: 20, y: 490 },
      data: { kind: "decision", label: "Is it paid?", condition: "order.status == 'paid'" },
    },
    {
      id: "add",
      type: "step",
      position: { x: -200, y: 680 },
      data: { kind: "step", label: "Add to total", description: "Totals.total += order.amount" },
    },
    {
      id: "report",
      type: "step",
      position: { x: 480, y: 490 },
      data: { kind: "step", label: "Return total", description: "Response.total = Totals.total" },
    },
    { id: "end", type: "end", position: { x: 584, y: 680 }, data: { kind: "end", label: "End" } },
  ],
  edges: [
    { id: "e1", source: "start", target: "load" },
    { id: "e3", source: "load", target: "more" },
    { id: "e4", source: "more", target: "paid", label: "yes" },
    { id: "e5", source: "more", target: "report", label: "no" },
    { id: "e6", source: "paid", target: "add", label: "yes" },
    { id: "e7", source: "paid", target: "more", label: "no" },
    { id: "e8", source: "add", target: "more" },
    { id: "e9", source: "report", target: "end" },
  ],
};
