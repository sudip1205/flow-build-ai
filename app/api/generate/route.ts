import { NextRequest, NextResponse } from "next/server";
import { parseGraph } from "@/lib/graph/parse";
import { validateGraph } from "@/lib/graph/validate";
import { toPromptSpec } from "@/lib/graph/toPromptSpec";
import { buildCodegenPrompt, extractFiles } from "@/lib/prompts/codegen";
import { getProvider, parseOverride } from "@/lib/providers";
import { LLMProvider } from "@/lib/providers/types";
import { isTargetLanguage } from "@/lib/graph/types";

// A whole project is a long reply, and local models write it slowly.
export const maxDuration = 300;

const errorResponse = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Request body must be JSON.", 400);
  }

  if (!isTargetLanguage(body.language)) {
    return errorResponse("Unsupported target language.", 400);
  }
  const language = body.language;

  const parsed = parseGraph(body.graph);
  if ("error" in parsed) return errorResponse(parsed.error, 400);
  const graph = parsed.graph;

  const validation = validateGraph(graph);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.errors.join(" "), errors: validation.errors },
      { status: 400 }
    );
  }

  let provider: LLMProvider;
  try {
    provider = getProvider(parseOverride(body.providerOverride));
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Invalid provider settings.", 400);
  }

  // Everything that went into the request comes back with the result, so the
  // build view can show each step exactly as the server ran it.
  const spec = toPromptSpec(graph);
  const prompt = buildCodegenPrompt(spec, language);
  const startedAt = Date.now();
  try {
    const { text: raw, truncated } = await provider.generate(prompt);
    const files = extractFiles(raw, language);
    if (!files.length) return errorResponse("The model returned an empty response.", 502);
    return NextResponse.json({
      files,
      spec,
      prompt,
      raw,
      truncated,
      model: provider.model,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unknown error", 502);
  }
}
