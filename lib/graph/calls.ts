import { CallType } from "./types";

export interface CallTypeInfo {
  /** Shown in the call type picker. */
  label: string;
  /** Shown in the node's header. */
  short: string;
  /** How the call is tagged in the prompt spec. */
  tag: string;
  /** Common verbs for the operation picker; free text is allowed too. */
  operations: string[];
  operationLabel: string;
  targetLabel: string;
  targetPlaceholder: string;
}

export const CALL_TYPE_INFO: Record<CallType, CallTypeInfo> = {
  rest: {
    label: "REST API",
    short: "REST API",
    tag: "REST API",
    operations: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    operationLabel: "Method",
    targetLabel: "Endpoint",
    targetPlaceholder: "e.g. /v1/accounts/{id}/verify",
  },
  graphql: {
    label: "GraphQL API",
    short: "GraphQL",
    tag: "GRAPHQL",
    operations: ["query", "mutation"],
    operationLabel: "Operation",
    targetLabel: "Operation name",
    targetPlaceholder: "e.g. getCustomer",
  },
  grpc: {
    label: "gRPC service",
    short: "gRPC",
    tag: "GRPC",
    operations: ["unary", "server stream", "client stream"],
    operationLabel: "Style",
    targetLabel: "Service and method",
    targetPlaceholder: "e.g. PaymentService/Charge",
  },
  db: {
    label: "Database",
    short: "Database",
    tag: "DATABASE",
    operations: ["select", "insert", "update", "upsert", "delete"],
    operationLabel: "Operation",
    targetLabel: "Table",
    targetPlaceholder: "e.g. users",
  },
  queue: {
    label: "Message queue / event",
    short: "Queue",
    tag: "QUEUE",
    operations: ["publish", "consume"],
    operationLabel: "Operation",
    targetLabel: "Topic or queue",
    targetPlaceholder: "e.g. order-events",
  },
  cache: {
    label: "Cache",
    short: "Cache",
    tag: "CACHE",
    operations: ["get", "set", "delete"],
    operationLabel: "Operation",
    targetLabel: "Key",
    targetPlaceholder: "e.g. session:{userId}",
  },
  email: {
    label: "Email / notification",
    short: "Notify",
    tag: "EMAIL",
    operations: ["email", "sms", "push"],
    operationLabel: "Channel",
    targetLabel: "Template",
    targetPlaceholder: "e.g. welcome-email",
  },
  sdk: {
    label: "Third-party SDK",
    short: "SDK",
    tag: "SDK",
    operations: [],
    operationLabel: "Operation",
    targetLabel: "SDK and method",
    targetPlaceholder: "e.g. stripe.paymentIntents.create",
  },
  llm: {
    label: "LLM / AI model",
    short: "AI model",
    tag: "LLM",
    operations: ["generate", "classify", "extract", "embed"],
    operationLabel: "Task",
    targetLabel: "Model",
    targetPlaceholder: "e.g. claude-sonnet-5-5",
  },
};
