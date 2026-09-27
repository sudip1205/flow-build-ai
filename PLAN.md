# FlowBuild-AI — Diagram-to-Code Tool

Project 1 of the portfolio series (see parent folder `PortfolioProject/`).

## Pitch
Draw a flowchart out of a constrained set of node types, pick a target
language, and get a real, working implementation of it. React + React
Flow for the canvas, a Next.js API route as the serverless backend that
talks to the LLM — deploys as one project to Vercel with a shareable
live demo link.

## The two decisions that make this buildable in ~2 weeks
1. **Structured data, not a picture.** The diagram is captured as a
   typed graph (nodes + labeled edges) via React Flow, and that JSON —
   not an image — is what goes to the LLM. Vision-based diagram
   reading is unreliable; structured-graph-to-prompt is not.
2. **Constrained node vocabulary.** Start, Step, Decision, Data, End —
   an algorithm/flowchart style, not "draw any architecture." Multi-
   language support ends up being *cheap* once the graph->prompt
   pipeline exists (mostly prompt-template changes per language).

## Node types (v1)
- **Start** (exactly 1) / **End** (1+)
- **Step** — a task, with a description
- **Decision** — must have exactly one "yes" and one "no" outgoing edge
- **Data** — a named variable/store

## Architecture
```
FlowCanvas (React Flow)  --graph JSON-->  /api/generate (serverless fn)
                                             |
                              validateGraph -> toPromptSpec -> LLM provider
                                             |
                                      generated code back to UI
```
- `lib/providers/` — `LLMProvider` interface + `OpenAICompatibleProvider`
  (covers Ollama/LM Studio/vLLM/LocalAI/OpenRouter/your own self-hosted
  endpoint) + `AnthropicProvider`. Env vars for local dev; a "bring your
  own key" panel (client-supplied, never persisted server-side) for the
  public live demo, so visitors don't need access to your own backend.
- `lib/graph/` — types, structural validation (single Start, decision
  branch rules, reachability), and the graph->text spec converter.
- `lib/prompts/` — per-language codegen prompt templates.

## v1 scope
1. Canvas: add/connect the 5 node types, edit properties in a side panel
2. Validate graph before generating
3. Generate code for Python / TypeScript / Go
4. Copy generated code
5. Save/load diagram (localStorage first, file export/import later)

## Roadmap (v1.1, not built for launch)
- Download as a full runnable project (deps + entry point), not just a snippet
- More target languages
- Custom color-coded node components (v0 scaffold uses default React Flow nodes)
- Subflows/grouping for bigger diagrams
- Reverse direction: existing code -> diagram

## Milestones (2-week budget)
| Days | Work |
|---|---|
| 1-2 | Scaffold done (this commit): Next.js + TS, React Flow canvas w/ 5 node types, graph model, validation, prompt spec converter, provider abstraction, CI |
| 3-4 | Polish node editing UX, custom node visuals per kind, edge labeling UX for decisions |
| 5-6 | Wire end-to-end generation for Python, verify quality, iterate on prompt |
| 7-8 | Add TypeScript + Go targets, error states, loading states |
| 9-10 | Save/load diagrams, settings panel (bring-your-own-key for demo) |
| 11-12 | Unit tests for validate/toPromptSpec/providers, CI green, accessibility pass |
| 13-14 | README + demo GIF, deploy to Vercel (live link), tag v1.0.0, write-up |

## Publish checklist
- [x] `git init`, initial scaffold commit
- [ ] Push to GitHub (create repo, add remote, push)
- [ ] MIT LICENSE (included)
- [ ] Deploy to Vercel for a live demo link
- [ ] README demo GIF
- [ ] GitHub Actions CI (included — lint + test + build)
- [ ] Tag `v1.0.0`
- [ ] Pin repo on GitHub profile
