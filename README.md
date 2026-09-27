# FlowBuild-AI

Draw a flowchart, pick a language, get working code.

FlowBuild-AI is a small, model-agnostic tool: build a flow diagram out of
a constrained set of node types (Start, Step, Decision, Data, End), and
generate a real, idiomatic implementation of it in the language of your
choice.

![demo placeholder](docs/demo.gif)

## Why structured nodes, not a freeform drawing
Vision-based diagram interpretation is unreliable. FlowBuild-AI captures
your diagram as structured data (a graph of typed nodes and labeled
edges) using [React Flow](https://reactflow.dev/), and sends that
structured graph — not a picture — to the LLM. That's what makes
generation reliable across languages.

## Node types
- **Start / End** — one Start, one or more End nodes
- **Step** — a task/action, with a short description
- **Decision** — a branch; must have exactly one "yes" and one "no"
  outgoing edge
- **Data** — a named variable/store referenced by later steps

## Bring your own LLM
No specific backend is hardcoded. Configure `.env.local` (copy from
`.env.example`):
- `LLM_PROVIDER=openai-compatible` (default) — works with Ollama,
  LM Studio, vLLM, LocalAI, OpenRouter, or any self-hosted endpoint
  that speaks the OpenAI `/chat/completions` dialect. Set
  `LLM_BASE_URL` and `LLM_MODEL`.
- `LLM_PROVIDER=anthropic` or `openai` — set `LLM_API_KEY` and
  `LLM_MODEL`.

## Getting started
```bash
npm install
cp .env.example .env.local   # then fill in your provider details
npm run dev
```

## Target languages (v1)
Python, TypeScript, Go — more are cheap to add since they're just
prompt-template changes, not new pipeline work.

## Roadmap
- Download generated code as a full runnable project (deps, entry point)
- More target languages
- Custom color-coded node components (v0 uses default React Flow nodes)
- "Bring your own key" panel for the public demo (so visitors don't need
  your own backend)
- Subflows / grouping for larger diagrams

## License
MIT
