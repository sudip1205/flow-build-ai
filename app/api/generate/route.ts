import { NextRequest, NextResponse } from "next/server";
import { validateGraph } from "@/lib/graph/validate";
import { toPromptSpec } from "@/lib/graph/toPromptSpec";
import { buildCodegenPrompt } from "@/lib/prompts/codegen";
import { getProvider } from "@/lib/providers";
import { FlowGraph, TargetLanguage } from "@/lib/graph/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const graph = body.graph as FlowGraph;
  const language = body.language as TargetLanguage;
  const override = body.providerOverride;

  const validation = validateGraph(graph);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  }

  const spec = toPromptSpec(graph);
  const prompt = buildCodegenPrompt(spec, language);

  try {
    const provider = getProvider(override);
    const code = await provider.generate(prompt);
    return NextResponse.json({ code });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
