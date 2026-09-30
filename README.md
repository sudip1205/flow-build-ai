# FlowBuild-AI

Draw a flowchart, pick a language, get a working project.

FlowBuild-AI is a model-agnostic tool: build a flow diagram out of a small,
constrained set of node types, and generate a layered, runnable service for
it in Python, TypeScript, Go or Java. You can also describe the flow in plain
language and let an AI assistant build or edit the diagram for you.

## Why structured nodes, not a freeform drawing
Vision-based diagram interpretation is unreliable. FlowBuild-AI captures your
diagram as structured data (a graph of typed nodes and labeled edges) using
[React Flow](https://reactflow.dev/), and sends that structured graph — not a
picture — to the LLM. That's what makes generation reliable across languages.

## Features
- **Visual editor** — drag, connect and resize nodes on a canvas, edit the
  selected node's fields in the sidebar.
- **AI assistant** — ask in plain language ("add a retry loop", "which node is a
  variable?"). It either answers or returns a complete updated diagram. The
  diagram is validated first and the model gets up to two chances to fix
  problems, then it's laid out automatically on the canvas; **Undo AI change**
  restores the previous diagram.
- **Full-project code generation** — not a single script: a layered project
  (entry point, controller/handler, DTOs, service, API clients, entities,
  repositories, error handling and tests). See [Generated projects](#generated-projects).
- **Build panel** — follow generation step by step, browse the generated file
  tree, copy or download any file, or **Download all** as a `.zip`.
- **Save, open and share** — save the diagram as JSON (⌘/Ctrl+S) and open it
  again later. Diagrams autosave in your browser.
- **Copy and paste nodes** — ⌘/Ctrl+C and ⌘/Ctrl+V (copied nodes also go on the
  system clipboard as JSON, so you can paste into another tab), plus a
  one-click Duplicate.
- **Example diagram** — one click loads a complete flow (data, a loop and a
  decision) to try.
- **Validation** — the diagram is checked against the rules below before any
  code is generated.

## Node types
- **Start / End** — exactly one Start (no incoming edges, one outgoing edge);
  one or more End nodes (no outgoing edges).
- **Step** — an action, with a short description. Its **step type** decides
  where its code goes: `logic` (plain code), `api` (an HTTP call to another
  service; set the endpoint, e.g. `POST /v1/accounts`) or `db` (a database
  read/write; set the table). Leave it on *Auto* and the model infers it.
- **Decision** — a yes/no branch with a condition; must have exactly one
  `yes` and one `no` outgoing edge. Loops are a decision whose body edge points
  back to it.
- **Data** — a named variable or store the flow reads or updates. One Data node
  can hold several variables, e.g. `orders, total = 0, seen = []`.

## Bring your own LLM
No specific backend is hardcoded. Configure `.env.local` (copy from
`.env.example`):
- `LLM_PROVIDER=openai-compatible` (default) — works with Ollama, LM Studio,
  vLLM, LocalAI, OpenRouter, or any self-hosted endpoint that speaks the
  OpenAI `/chat/completions` dialect. Set `LLM_BASE_URL` and `LLM_MODEL`.
- `LLM_PROVIDER=anthropic` or `openai` — set `LLM_API_KEY` and `LLM_MODEL`.

The in-app **Model settings** panel lets a visitor supply their own provider,
base URL, model and API key for their requests, so a public deployment doesn't
need to ship a backend key. Because a visitor-supplied base URL makes *your*
server issue the request, URLs that point at localhost or the private network
are rejected. On a private deployment you trust, set
`ALLOW_PRIVATE_BASE_URL=true` to allow them.

## Getting started
```bash
npm install
cp .env.example .env.local   # then fill in your provider details
npm run dev
```

Then open http://localhost:3000.

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | Lint with ESLint |
| `npm test` | Run the Vitest suite |

CI (GitHub Actions) runs lint, tests and a production build on every push and
pull request.

## Generated projects
Pick a target language in the sidebar. Each language gets an idiomatic stack and
layout, and every layout keeps the flow's logic in one service class so it's easy
to read and test:

| Language | Stack |
| --- | --- |
| Python | FastAPI, Pydantic v2, SQLAlchemy 2.0, httpx, pytest |
| TypeScript | Node.js 20, Express, zod, TypeORM, fetch, vitest |
| Go | Go 1.22, `net/http`, `database/sql`, table-driven tests |
| Java | Java 17, Spring Boot 3, Spring Data JPA, RestClient, JUnit 5 + Mockito |

Adding a language is mostly a prompt-template change, not new pipeline work.

## Project layout
- `app/` — Next.js app, plus the `/api/generate` and `/api/assist` routes
- `components/` — the canvas, node components and build panel
- `lib/graph/` — graph types, parsing, validation, layout, clipboard and the
  prompt spec sent to the model
- `lib/prompts/` — the code-generation and assistant prompts
- `lib/providers/` — the LLM provider adapters
- `test/` — Vitest tests

## Roadmap
- More target languages
- Subflows / grouping for larger diagrams

## License
[MIT](LICENSE) © 2026 Sudipto Aich
