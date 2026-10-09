# Changelog

## 0.2.0 — 2026-10-08

This release turns FlowBuild-AI from a single-language prototype into a
proper diagram editor: flows can now describe the systems they call and the
data they work on, and the generated projects are laid out the way a real
service would be.

### New features

**Call nodes for backend systems**
- New `call` node replaces the old `dataStore` node and the step "action" setting.
- Nine call types: REST, GraphQL, gRPC, database, queue, cache, email, SDK and LLM.
- Each call has an operation (e.g. `POST`, `select`, `publish`), a target (endpoint, table, topic, key or model), an input and an output.
- The operation picker suggests common verbs for each call type; free text still works.

**Data objects (ERD-style tables)**
- Define named data objects beside the flow, each with a role: `input`, `state`, `output` or `config`.
- Edit fields as a table on the canvas, with a name, a type (`string`, `number`, `boolean`, `date`, `list`, `object` or any short type) and a default value.
- Drag tables anywhere; their positions are saved and kept when the AI assistant changes the diagram.
- Refer to fields as `Name.field` in any node. Fields autocomplete as you type, and references to fields that don't exist are highlighted.

**Draw.io-style editor**
- Menu bar with File and Edit menus, keyboard navigation and shortcut hints.
- File: new diagram, open, open example, save as JSON (`⌘/Ctrl+S`), clear canvas.
- Edit: cut, copy, paste and duplicate (`⌘/Ctrl+X/C/V`), delete, select all and none, edit label, undo the last AI change, and add any node or a data set.
- Resizable nodes, with a "Reset size" option.

**Code generation**
- Java projects now follow Spring Boot layers: controller, request and response DTOs, service, one client and DTO pair per external system, JPA entities and repositories, a global exception handler and tests.
- Input data objects become `FlowRequest`, output objects become `FlowResponse`, and each database table gets an entity and repository (in every language).
- File names are recovered reliably from model output, including fence paths, headings, bold lines, first-line comments, and Java `package` and class declarations. This fixes files coming back as "Part 1" or under the wrong name.
- Fenced examples inside a generated README stay part of the README.
- A reply that is cut off still keeps its last file.

**AI assistant**
- Understands call nodes and data objects, and keeps your existing data objects when a change doesn't mention them.
- Answers questions without redrawing the diagram.
- Accepts more loosely formatted replies: code fences, extra text, kind synonyms (`action`, `stop`, …), True/False branches, and old-style variable nodes, which it converts into data objects.

**Validation**
- Data object and field names must be single identifiers, with no duplicates.
- Warns when a node uses `Name.field` and that field doesn't exist.

### Improvements
- Clearer model errors. A model name the server rejects (common with Ollama) now says which name failed and how to fix it.
- Auto-layout places data tables in a column beside the flow without overlapping it.
- New app icon and brand assets (`public/brand/`), plus a logo in the README.

### Breaking changes
- The `dataStore` node kind and the step `action`/`resource` fields have been removed. Diagrams saved with 0.1.0 still open: old data nodes are converted into data objects, and API or database steps are converted into call nodes.

### Tests
- 105 tests across parsing, validation, layout, prompt spec, code generation, the assistant and providers.
