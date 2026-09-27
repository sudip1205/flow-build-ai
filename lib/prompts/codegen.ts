import { TargetLanguage } from "../graph/types";

const LANGUAGE_HINTS: Record<TargetLanguage, string> = {
  python: "idiomatic Python 3, using functions and if/elif/else for decisions. Include a short pytest test.",
  typescript: "idiomatic TypeScript (Node.js), using functions and if/else for decisions. Include a short vitest test.",
  go: "idiomatic Go, using functions and if/else for decisions. Include a short table-driven test using the standard testing package.",
};

export function buildCodegenPrompt(spec: string, language: TargetLanguage): string {
  return [
    `You will be given a flowchart described as a structured list of nodes and directed edges.`,
    `Translate it into a single, working, idiomatic implementation in ${language}.`,
    `Guidance: ${LANGUAGE_HINTS[language]}`,
    `Rules:`,
    `- DECISION nodes become branches (if/else); the "yes"/"no" edge labels indicate which branch to take.`,
    `- DATA nodes become named variables/state.`,
    `- STEP nodes become function calls or inline logic with a short comment naming the step.`,
    `- Output ONLY the code (plus its test), no prose, in a single fenced code block.`,
    ``,
    `Flowchart:`,
    spec,
  ].join("\n");
}
