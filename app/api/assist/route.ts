import { NextRequest, NextResponse } from "next/server";
import { parseGraph } from "@/lib/graph/parse";
import { validateGraph } from "@/lib/graph/validate";
import { autoLayout } from "@/lib/graph/layout";
import { AssistReply, buildAssistPrompt, buildAssistRepairPrompt, parseAssistReply } from "@/lib/prompts/assist";
import { getProvider, parseOverride } from "@/lib/providers";
import { LLMProvider } from "@/lib/providers/types";

// Local models can be slow, and each bad answer costs another round trip.
export const maxDuration = 180;

const MAX_REPAIRS = 2;

const MAX_REQUEST = 2000;

const errorResponse = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Everything wrong with a reply, phrased the way the model needs to hear it
 * to fix it: by node id (which it wrote) rather than by label, and with the
 * fix spelled out. validateGraph's own messages cover the remaining rules.
 */
function problemsWith(result: AssistReply | { error: string }): string[] {
  if ("error" in result) return [result.error];
  if (!result.graph) return [];
  const { nodes, edges } = result.graph;
  const ids = new Set(nodes.map((n) => n.id));

  const dangling = edges
    .filter((e) => !ids.has(e.source) || !ids.has(e.target))
    .map((e) => {
      const missing = ids.has(e.source) ? e.target : e.source;
      return `The edge from "${e.source}" to "${e.target}" uses "${missing}", which is not the id of any node. Add a node with id "${missing}" or point the edge at an existing node.`;
    });

  const startIds = new Set(nodes.filter((n) => n.data.kind === "start").map((n) => n.id));
  const intoStart = edges
    .filter((e) => startIds.has(e.target))
    .map((e) => {
      const first = edges.find((f) => f.source === e.target)?.target;
      return `The edge from "${e.source}" goes back to "${e.target}", but start can't have incoming edges. To repeat part of the flow, point it at the first node to repeat instead${first ? ` (e.g. "${first}")` : ""}.`;
    });

  const reached = new Set<string>();
  const stack = nodes.filter((n) => n.data.kind === "start").map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    edges.filter((e) => e.source === id).forEach((e) => stack.push(e.target));
  }
  const unreachable = reached.size
    ? nodes
        .filter((n) => !reached.has(n.id))
        .map((n) =>
          n.data.kind === "end"
            ? `Nothing leads to "${n.id}" (end). If the flow loops, the loop's decision needs a "no" edge that leaves the loop and eventually reaches "${n.id}".`
            : `Nothing on the path from start leads to "${n.id}". Put it on the path: change an existing edge so it goes into "${n.id}", and have "${n.id}"'s own edge continue to the node that edge used to go to.`
        )
    : [];

  const rest = validateGraph(result.graph).errors.filter(
    (msg) => !msg.includes("doesn't exist") && !msg.startsWith("Unreachable") && !msg.startsWith("Start node can't have incoming")
  );
  return [...dangling, ...intoStart, ...unreachable, ...rest];
}

/**
 * Turns a plain-language request ("add a retry loop", "which node is a
 * variable?") into either an answer or a complete updated diagram. If the
 * model's diagram isn't one the code generator would accept, it gets up to
 * MAX_REPAIRS chances to fix it; after that the best attempt is returned with
 * its remaining issues so the user can finish it by hand.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Request body must be JSON.", 400);
  }

  const request = typeof body.request === "string" ? body.request.trim() : "";
  if (!request) return errorResponse("Tell the assistant what you want.", 400);
  if (request.length > MAX_REQUEST) {
    return errorResponse(`Request is too long (max ${MAX_REQUEST} characters).`, 400);
  }

  const parsed = parseGraph(body.graph);
  if ("error" in parsed) return errorResponse(parsed.error, 400);
  const current = parsed.graph;

  let provider: LLMProvider;
  try {
    provider = getProvider(parseOverride(body.providerOverride));
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Invalid provider settings.", 400);
  }

  const prompt = buildAssistPrompt(request, current);
  let result: AssistReply | { error: string };
  try {
    let raw = (await provider.generate(prompt)).text;
    result = parseAssistReply(raw);
    let problems = problemsWith(result);
    for (let attempt = 0; attempt < MAX_REPAIRS && problems.length; attempt++) {
      const retriedRaw = (await provider.generate(buildAssistRepairPrompt(prompt, raw, problems))).text;
      const retried = parseAssistReply(retriedRaw);
      const retriedProblems = problemsWith(retried);
      // Keep whichever answer is closer to valid; a "fix" can make things worse.
      const worse = "error" in retried && !("error" in result);
      if (!worse && retriedProblems.length <= problems.length) {
        raw = retriedRaw;
        result = retried;
        problems = retriedProblems;
      }
    }
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error", 502);
  }

  if ("error" in result) {
    return errorResponse(`The model's answer couldn't be used: ${result.error}`, 502);
  }
  const graph = result.graph ? autoLayout(result.graph, current) : null;
  return NextResponse.json({
    reply: result.reply || "Updated the diagram.",
    graph,
    issues: graph ? validateGraph(graph).errors : [],
  });
}
