import { parseGraph } from "@/lib/graph/parse";
import { formatFields } from "@/lib/graph/fields";
import { CALL_TYPES, CallType, FlowGraph, isCallType } from "@/lib/graph/types";

/**
 * When to use each node kind. Mirrors the rules validateGraph enforces and
 * how toPromptSpec / the codegen prompt treat each kind, so a diagram the
 * assistant builds is one the code generator can use.
 */
const NODE_GUIDE = [
  `- start: where the flow begins. Exactly one per diagram. No incoming edges, exactly one outgoing edge.`,
  `- step: plain logic — calculate, transform, check, build something. label = short verb phrase; description = what it does, code-like is fine and uses data references (e.g. "Totals.total += order.amount"). Exactly one outgoing edge.`,
  `- call: a backend call. "callType" is one of ${CALL_TYPES.join(", ")} (rest = HTTP API, db = database, queue = publish/consume a message, cache, email = any notification, sdk = third-party SDK, llm = AI model). "operation" = the verb (e.g. "POST", "select", "publish"); "target" = the endpoint, table, topic, key, SDK method or model (e.g. "/v1/accounts/verify", "users"); "input" = what it sends and "output" = where the result goes, both as data references (e.g. input "Request.accountId", output "Account.status"). Use a call — never a step — for anything that talks to another system or a database. Exactly one outgoing edge.`,
  `- decision: a yes/no question that branches (if/else). condition = the boolean expression (e.g. "Account.status == 'active'"). Exactly two outgoing edges, labelled "yes" and "no". For a loop, make a decision like "More items?" and send the end of the loop body back to it with an edge.`,
  `- end: where the flow finishes. At least one. No outgoing edges. label can name the result (e.g. "Return total").`,
].join("\n");

/** Data objects live beside the flow, never in it. */
const DATA_GUIDE = [
  `- The flow's data lives in "data", NOT in nodes: a list of objects {"name", "role", "description"?, "fields"}. name is one word in PascalCase (e.g. "Request", "Totals"). role is "input" (what the flow is called with), "output" (what it returns), "state" (working values) or "config" (settings). fields is comma-separated text, each "name: type = initial value" with type and value optional (e.g. "total: number = 0, count: number = 0").`,
  `- Nodes refer to data as Name.field (e.g. "Request.accountId"). Only use fields that exist; add a field to its object when the flow needs a new one.`,
  `- Return "data" with every object you keep (same names), or leave "data" out to keep the current data unchanged.`,
].join("\n");

// A loop that also filters, since that's the shape small models most often
// get wrong (folding "more items?" and "keep this one?" into one decision).
const EXAMPLE_REPLY = JSON.stringify({
  intent: "change",
  reply: "Loads the customer's orders from the database, loops over them and adds up only the paid ones, keeping the running totals in a state object.",
  diagram: {
    data: [
      { name: "Request", role: "input", fields: "customerId: string" },
      { name: "Totals", role: "state", fields: "orders: list, total: number = 0, count: number = 0" },
      { name: "Response", role: "output", fields: "total: number, count: number" },
    ],
    nodes: [
      { id: "start", kind: "start", label: "Start" },
      { id: "load", kind: "call", label: "Load orders", callType: "db", operation: "select", target: "orders", input: "Request.customerId", output: "Totals.orders" },
      { id: "more", kind: "decision", label: "More orders?", condition: "there is a next order in Totals.orders" },
      { id: "paid", kind: "decision", label: "Is it paid?", condition: "order.status == 'paid'" },
      { id: "add", kind: "step", label: "Add to total", description: "Totals.total += order.amount; Totals.count += 1" },
      { id: "reply", kind: "step", label: "Build response", description: "Response.total = Totals.total; Response.count = Totals.count" },
      { id: "end", kind: "end", label: "Return totals" },
    ],
    edges: [
      { from: "start", to: "load" },
      { from: "load", to: "more" },
      { from: "more", to: "paid", label: "yes" },
      { from: "paid", to: "add", label: "yes" },
      { from: "paid", to: "more", label: "no" },
      { from: "add", to: "more" },
      { from: "more", to: "reply", label: "no" },
      { from: "reply", to: "end" },
    ],
  },
});

/** The diagram as the model sees it: ids, kinds and text, no positions. */
function compactGraph(graph: FlowGraph) {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      ...(n.data.description ? { description: n.data.description } : {}),
      ...(n.data.condition ? { condition: n.data.condition } : {}),
      ...(n.data.callType ? { callType: n.data.callType } : {}),
      ...(n.data.operation ? { operation: n.data.operation } : {}),
      ...(n.data.target ? { target: n.data.target } : {}),
      ...(n.data.input ? { input: n.data.input } : {}),
      ...(n.data.output ? { output: n.data.output } : {}),
    })),
    edges: graph.edges.map((e) => ({ from: e.source, to: e.target, ...(e.label ? { label: e.label } : {}) })),
    data: (graph.data ?? []).map((d) => ({
      name: d.name,
      role: d.role,
      ...(d.description ? { description: d.description } : {}),
      fields: formatFields(d.fields),
    })),
  };
}

export function buildAssistPrompt(request: string, graph: FlowGraph): string {
  return [
    `You are the diagram assistant in FlowBuild-AI. People draw a flowchart there, and it is later turned into working code.`,
    `First decide what the user wants:`,
    `- A QUESTION (e.g. "which node should I use for…", "what is a decision?", "how do I…"): answer it in "reply" and set "diagram" to null. Do NOT change the diagram, even to show an example.`,
    `- A CHANGE (e.g. "build…", "add…", "remove…", "rename…", "make it…"): return the complete updated diagram.`,
    ``,
    `Node kinds (use exactly these names):`,
    NODE_GUIDE,
    ``,
    `Data:`,
    DATA_GUIDE,
    ``,
    `Rules:`,
    `- Keep the id of every existing node you keep. New ids are short snake_case words.`,
    `- Labels are short (2-5 words); put detail in description or condition.`,
    `- Only "yes"/"no" edge labels, and only on edges leaving a decision.`,
    `- If the user asks you to build something new and the diagram only has Start/End, replace it.`,
    `- The flow holds only steps, calls and decisions between start and end; data is never a node.`,
    `- To process each item of a list, use a loop: a decision like "More orders?" whose "yes" edge leads into the loop body, the last node of the body goes back to that decision, and "no" leads on to the rest of the flow.`,
  `- Checking each item (e.g. "only paid orders") is a SECOND decision inside the loop body; its "no" edge goes back to the loop decision. Never use the item check as the loop decision.`,
    ``,
    `Before answering a CHANGE, check your diagram:`,
    `- Every edge's "from" and "to" is the id of a node in "nodes". Never point an edge at an id you didn't define.`,
    `- Every node except an end has exactly one outgoing edge; every decision has exactly two ("yes" and "no").`,
    `- Every node can be reached from start by following edges.`,
    ``,
    `Current diagram:`,
    JSON.stringify(compactGraph(graph)),
    ``,
    `User request:`,
    request,
    ``,
    `Respond with ONLY one JSON object and nothing else:`,
    `{"intent": "question" or "change", "reply": "<1-3 sentences: the answer to their question, or what you changed and why you chose those node kinds>", "diagram": <for "change": the COMPLETE updated diagram as {"data": [...], "nodes": [...], "edges": [...]}; for "question": null>}`,
    `Data object: {"name", "role", "description"?, "fields"}. Node: {"id", "kind", "label", "description"?, "condition"? (decision only), "callType"?, "operation"?, "target"?, "input"?, "output"? (call only)}. Edge: {"from", "to", "label"?}.`,
    ``,
    `Example response:`,
    EXAMPLE_REPLY,
  ].join("\n");
}

export function buildAssistRepairPrompt(originalPrompt: string, badReply: string, problems: string[]): string {
  return [
    originalPrompt,
    ``,
    `Your previous response was:`,
    badReply,
    ``,
    `It has these problems:`,
    ...problems.map((p) => `- ${p}`),
    ``,
    `Fix them and respond with ONLY the corrected JSON object. Its "reply" is for the user: describe the diagram and why, not these fixes.`,
  ].join("\n");
}

// "dataStore" is the old data node; parseGraph turns those into data objects.
const KIND_ALIASES: Record<string, string> = {
  start: "start",
  begin: "start",
  step: "step",
  action: "step",
  process: "step",
  logic: "step",
  call: "call",
  decision: "decision",
  condition: "decision",
  branch: "decision",
  datastore: "dataStore",
  data: "dataStore",
  variable: "dataStore",
  state: "dataStore",
  end: "end",
  stop: "end",
  finish: "end",
};

// Kinds a model may use for a call, naming its type instead.
const CALL_KIND_ALIASES: Record<string, CallType> = {
  api: "rest",
  rest: "rest",
  http: "rest",
  apicall: "rest",
  restcall: "rest",
  db: "db",
  database: "db",
  dbcall: "db",
  query: "db",
  graphql: "graphql",
  grpc: "grpc",
  queue: "queue",
  event: "queue",
  cache: "cache",
  email: "email",
  notification: "email",
  sdk: "sdk",
  llm: "llm",
};

const BRANCH_ALIASES: Record<string, "yes" | "no"> = { yes: "yes", true: "yes", y: "yes", no: "no", false: "no", n: "no" };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Old-style data node variables as text, whether the model wrote a string or a list. */
const fieldsText = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : text(v));

const callTypeOf = (v: unknown): CallType | undefined => {
  const name = String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return isCallType(name) ? name : CALL_KIND_ALIASES[name];
};

/** Pulls the first JSON object out of a reply, tolerating code fences and chatter around it. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(body.slice(start, end + 1));
}

export type AssistReply = { reply: string; graph: FlowGraph | null };

/**
 * Turns the model's loosely-typed JSON into a FlowGraph (positions left at 0),
 * forgiving the mistakes small local models tend to make: kind names in other
 * words, "True"/"False" branch labels, missing or duplicate ids.
 */
export function parseAssistReply(raw: string): AssistReply | { error: string } {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch {
    return { error: "The response wasn't valid JSON." };
  }
  if (!isObject(json)) return { error: "The response must be a JSON object." };

  const reply = text(json.reply) ?? text(json.message) ?? "";
  // Models like to "helpfully" draw an example when asked a question; the
  // intent they declared up front wins over the diagram they drew after it.
  const isQuestion = String(json.intent ?? "").toLowerCase() === "question";
  const diagram = isQuestion ? null : json.diagram ?? json.graph ?? null;
  if (diagram === null) {
    return reply ? { reply, graph: null } : { error: `"reply" is missing.` };
  }
  if (!isObject(diagram) || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
    return { error: `"diagram" must be null or an object with "nodes" and "edges" arrays.` };
  }

  const ids = new Set<string>();
  const kinds = new Map<string, string>();
  const nodes = [];
  for (const [i, raw] of diagram.nodes.entries()) {
    if (!isObject(raw)) return { error: `Node ${i + 1} isn't an object.` };
    const kindName = String(raw.kind ?? raw.type ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const aliasedCall = CALL_KIND_ALIASES[kindName];
    const kind = aliasedCall ? "call" : KIND_ALIASES[kindName];
    if (!kind) return { error: `Node ${i + 1} has unknown kind "${raw.kind ?? raw.type}".` };
    let id = text(raw.id) ?? `${kind}_${i + 1}`;
    while (ids.has(id)) id = `${id}_${i + 1}`;
    ids.add(id);
    kinds.set(id, kind);
    const label = text(raw.label) ?? text(raw.name) ?? (kind === "start" ? "Start" : kind === "end" ? "End" : id);
    nodes.push({
      id,
      data: {
        kind,
        label,
        description: text(raw.description),
        condition: kind === "decision" ? text(raw.condition) : undefined,
        ...(kind === "dataStore" ? { fields: fieldsText(raw.fields ?? raw.variables) } : {}),
        ...(kind === "call"
          ? {
              callType: callTypeOf(raw.callType ?? raw.type) ?? aliasedCall ?? "rest",
              operation: text(raw.operation) ?? text(raw.method),
              target: text(raw.target) ?? text(raw.resource) ?? text(raw.endpoint) ?? text(raw.table),
              input: text(raw.input),
              output: text(raw.output),
            }
          : {}),
      },
    });
  }

  const edges = [];
  const edgeIds = new Set<string>();
  for (const [i, raw] of diagram.edges.entries()) {
    if (!isObject(raw)) return { error: `Edge ${i + 1} isn't an object.` };
    const source = text(raw.from) ?? text(raw.source);
    const target = text(raw.to) ?? text(raw.target);
    if (!source || !target) return { error: `Edge ${i + 1} needs "from" and "to".` };
    const label =
      kinds.get(source) === "decision" ? BRANCH_ALIASES[String(raw.label ?? "").toLowerCase().trim()] : undefined;
    let id = `${source}->${target}${label ? `:${label}` : ""}`;
    while (edgeIds.has(id)) id = `${id}_${i + 1}`;
    edgeIds.add(id);
    edges.push({ id, source, target, label });
  }

  const data = Array.isArray(diagram.data) ? diagram.data : undefined;

  // Reuse the request parser for its size limits, its final shape and for
  // turning any old-style data nodes into data objects.
  const parsed = parseGraph({ nodes, edges, ...(data ? { data } : {}) });
  if ("error" in parsed) return { error: parsed.error };
  return { reply, graph: parsed.graph };
}
