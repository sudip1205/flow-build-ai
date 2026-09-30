import { parseGraph } from "@/lib/graph/parse";
import { formatFields, parseFields } from "@/lib/graph/fields";
import { FlowGraph, NodeKind, isStepAction } from "@/lib/graph/types";

/**
 * When to use each node kind. Mirrors the rules validateGraph enforces and
 * how toPromptSpec / the codegen prompt treat each kind, so a diagram the
 * assistant builds is one the code generator can use.
 */
const NODE_GUIDE = [
  `- start: where the flow begins. Exactly one per diagram. No incoming edges, exactly one outgoing edge.`,
  `- dataStore: a variable, input or piece of state the flow reads or updates (becomes a named variable in code). label = the variable name (e.g. "orders", "total"); description = what it holds and its starting value (e.g. "running total, starts at 0"). Several related values can share one dataStore (always do this when the user asks to keep values together): then label = a name for the group (e.g. "Order state") and "fields" = its variables as comma-separated text, each optionally "name = initial value" (e.g. "orders, total = 0, count = 0"). Variables go in "fields", never in "description". Put these right after start, in the main path. Exactly one outgoing edge.`,
  `- step: an action — calculate, call, save, send, transform. label = short verb phrase; description = what it does, code-like is fine (e.g. "total += order.amount"). A step that calls another service over HTTP gets action "api" and resource = its endpoint (e.g. "POST /v1/accounts/verify"); one that reads or writes a database gets action "db" and resource = the table name; plain logic needs no action. Exactly one outgoing edge.`,
  `- decision: a yes/no question that branches (if/else). condition = the boolean expression (e.g. "order.status == 'paid'"). Exactly two outgoing edges, labelled "yes" and "no". For a loop, make a decision like "More items?" and send the end of the loop body back to it with an edge.`,
  `- end: where the flow finishes. At least one. No outgoing edges. label can name the result (e.g. "Return total").`,
].join("\n");

// A loop that also filters, since that's the shape small models most often
// get wrong (folding "more items?" and "keep this one?" into one decision).
const EXAMPLE_REPLY = JSON.stringify({
  intent: "change",
  reply: "Added a dataStore for the input and one holding both running totals, a loop over the numbers, and a check that only adds even ones.",
  diagram: {
    nodes: [
      { id: "start", kind: "start", label: "Start" },
      { id: "numbers", kind: "dataStore", label: "numbers", description: "input list of integers" },
      { id: "totals", kind: "dataStore", label: "Running totals", fields: "total = 0, count = 0", description: "sum and count of even numbers so far" },
      { id: "more", kind: "decision", label: "More numbers?", condition: "there is a next number" },
      { id: "even", kind: "decision", label: "Is it even?", condition: "number % 2 == 0" },
      { id: "add", kind: "step", label: "Add to total", description: "total += number; count += 1" },
      { id: "end", kind: "end", label: "Return total" },
    ],
    edges: [
      { from: "start", to: "numbers" },
      { from: "numbers", to: "totals" },
      { from: "totals", to: "more" },
      { from: "more", to: "even", label: "yes" },
      { from: "even", to: "add", label: "yes" },
      { from: "even", to: "more", label: "no" },
      { from: "add", to: "more" },
      { from: "more", to: "end", label: "no" },
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
      ...(n.data.fields ? { fields: n.data.fields } : {}),
      ...(n.data.action ? { action: n.data.action } : {}),
      ...(n.data.resource ? { resource: n.data.resource } : {}),
    })),
    edges: graph.edges.map((e) => ({ from: e.source, to: e.target, ...(e.label ? { label: e.label } : {}) })),
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
    `Rules:`,
    `- Keep the id of every existing node you keep. New ids are short snake_case words.`,
    `- Labels are short (2-5 words); put detail in description or condition.`,
    `- Only "yes"/"no" edge labels, and only on edges leaving a decision.`,
    `- If the user asks you to build something new and the diagram only has Start/End, replace it.`,
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
    `{"intent": "question" or "change", "reply": "<1-3 sentences: the answer to their question, or what you changed and why you chose those node kinds>", "diagram": <for "change": the COMPLETE updated diagram as {"nodes": [...], "edges": [...]}; for "question": null>}`,
    `Node: {"id", "kind", "label", "description"?, "condition"?, "fields"? (dataStore only), "action"? and "resource"? (step only)}. Edge: {"from", "to", "label"?}.`,
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

const KIND_ALIASES: Record<string, NodeKind> = {
  start: "start",
  begin: "start",
  step: "step",
  action: "step",
  process: "step",
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

const BRANCH_ALIASES: Record<string, "yes" | "no"> = { yes: "yes", true: "yes", y: "yes", no: "no", false: "no", n: "no" };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Variables as the canonical comma-separated text, whether the model wrote a string or a list. */
function fieldsText(v: unknown): string | undefined {
  const raw = Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : text(v);
  return raw ? formatFields(parseFields(raw)) || undefined : undefined;
}

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
  const kinds = new Map<string, NodeKind>();
  const nodes = [];
  for (const [i, raw] of diagram.nodes.entries()) {
    if (!isObject(raw)) return { error: `Node ${i + 1} isn't an object.` };
    const kindName = String(raw.kind ?? raw.type ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const kind = KIND_ALIASES[kindName];
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
        fields: kind === "dataStore" ? fieldsText(raw.fields ?? raw.variables) : undefined,
        action: kind === "step" && isStepAction(raw.action) ? raw.action : undefined,
        resource: kind === "step" ? text(raw.resource) : undefined,
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

  // Reuse the request parser for its size limits and final shape.
  const parsed = parseGraph({ nodes, edges });
  if ("error" in parsed) return { error: parsed.error };
  return { reply, graph: parsed.graph };
}
