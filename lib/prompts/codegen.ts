import { TargetLanguage } from "../graph/types";

/**
 * How the generated project is laid out in each language. Every layout keeps
 * the same layers apart: HTTP entry point, request/response models, one
 * service holding all of the flow's logic, one client per external system,
 * and one entity + repository per database table.
 */
interface ProjectLayout {
  stack: string;
  files: string[];
  /** Where unnamed code blocks go when the model forgets to name them. */
  service: string;
  test: string;
}

const JAVA_SRC = "src/main/java/com/flowbuild/app";

const LAYOUTS: Record<TargetLanguage, ProjectLayout> = {
  java: {
    stack:
      "Java 17, Spring Boot 3 (spring-boot-starter-web, spring-boot-starter-data-jpa, spring-boot-starter-validation), RestClient for HTTP calls, plain classes or records (no Lombok), JUnit 5 + Mockito. Base package com.flowbuild.app.",
    files: [
      "pom.xml — Maven build with the starters above, an H2 runtime dependency for local runs, and spring-boot-starter-test.",
      "src/main/resources/application.yml — datasource settings and one base-url / api-key property per external system (api keys read from environment variables).",
      `${JAVA_SRC}/Application.java — @SpringBootApplication main class.`,
      `${JAVA_SRC}/controller/FlowController.java — @RestController exposing the flow as one POST endpoint; @Valid FlowRequest in, ResponseEntity<FlowResponse> out; no business logic.`,
      `${JAVA_SRC}/dto/FlowRequest.java and ${JAVA_SRC}/dto/FlowResponse.java — the endpoint's request and response POJOs with Jakarta validation annotations.`,
      `${JAVA_SRC}/service/FlowService.java — @Service holding ALL of the flow's logic, decisions and loops, calling clients and repositories.`,
      `${JAVA_SRC}/client/<System>Client.java — one @Component per external system, one method per call, built on RestClient.`,
      `${JAVA_SRC}/client/dto/<System><Operation>Request.java and ...Response.java — request/response POJOs for every REST call.`,
      `${JAVA_SRC}/entity/<Table>.java — one JPA @Entity per database table.`,
      `${JAVA_SRC}/repository/<Table>Repository.java — one Spring Data JpaRepository per entity, with the derived query methods the flow needs.`,
      `${JAVA_SRC}/exception/<Name>Exception.java and ${JAVA_SRC}/exception/GlobalExceptionHandler.java — @RestControllerAdvice mapping each failure outcome to an HTTP status and an error body.`,
      "src/test/java/com/flowbuild/app/service/FlowServiceTest.java — JUnit 5 + Mockito test of FlowService with clients and repositories mocked; assertions via Assertions.assertEquals / assertThrows (never the plain assert keyword).",
    ],
    service: `${JAVA_SRC}/service/FlowService.java`,
    test: "src/test/java/com/flowbuild/app/service/FlowServiceTest.java",
  },
  python: {
    stack: "Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2.0 ORM, httpx for HTTP calls, pytest.",
    files: [
      "requirements.txt — dependencies with major versions pinned.",
      "app/__init__.py — empty package marker (and one in each package directory below).",
      "app/main.py — FastAPI app including the router and the exception handlers.",
      "app/config.py — settings (pydantic-settings) for the database URL and one base URL / API key per external system, read from environment variables.",
      "app/api/routes.py — one POST endpoint taking FlowRequest and returning FlowResponse; no business logic.",
      "app/schemas/flow.py — FlowRequest and FlowResponse Pydantic models with validation.",
      "app/services/flow_service.py — FlowService class holding ALL of the flow's logic, decisions and loops, calling the clients and repositories it receives in its constructor.",
      "app/clients/<system>_client.py — one client class per external system, one method per call, using httpx.",
      "app/clients/<system>_models.py — Pydantic request/response models for every REST call of that system.",
      "app/db/session.py — engine, SessionLocal and Base.",
      "app/models/<table>.py — one SQLAlchemy model per database table.",
      "app/repositories/<table>_repository.py — one repository class per model with the query methods the flow needs.",
      "app/exceptions.py — one exception per failure outcome, plus the FastAPI exception handlers that map them to HTTP responses.",
      "tests/test_flow_service.py — pytest tests of FlowService with fake clients and repositories.",
    ],
    service: "app/services/flow_service.py",
    test: "tests/test_flow_service.py",
  },
  typescript: {
    stack: "TypeScript on Node.js 20, Express, zod for validation, TypeORM for the database, the built-in fetch for HTTP calls, vitest.",
    files: [
      "package.json and tsconfig.json — scripts for dev, build, start and test.",
      "src/index.ts — Express app wiring the routes, the error handler and the data source.",
      "src/config.ts — the database URL and one base URL / API key per external system, read from environment variables.",
      "src/routes/flowRoutes.ts — one POST route: validate FlowRequest, call the service, return FlowResponse; no business logic.",
      "src/dto/flowDto.ts — FlowRequest (zod schema + inferred type) and FlowResponse.",
      "src/services/flowService.ts — FlowService class holding ALL of the flow's logic, decisions and loops, calling the clients and repositories it receives in its constructor.",
      "src/clients/<system>Client.ts — one client class per external system, one method per call.",
      "src/clients/dto/<system>Dto.ts — request/response types for every REST call of that system.",
      "src/db/dataSource.ts — the TypeORM DataSource.",
      "src/entities/<Table>.ts — one TypeORM @Entity per database table.",
      "src/repositories/<table>Repository.ts — one repository class per entity with the query methods the flow needs.",
      "src/errors.ts — one error class per failure outcome, plus the Express error handler mapping them to HTTP responses.",
      "test/flowService.test.ts — vitest tests of FlowService with fake clients and repositories.",
    ],
    service: "src/services/flowService.ts",
    test: "test/flowService.test.ts",
  },
  go: {
    stack: "Go 1.22, net/http (standard library router), database/sql, encoding/json, the standard testing package with table-driven tests. Module path github.com/flowbuild/app.",
    files: [
      "go.mod — module github.com/flowbuild/app.",
      "cmd/server/main.go — wires config, database, clients, repositories, service and handler, then starts the server.",
      "internal/config/config.go — the database DSN and one base URL / API key per external system, read from environment variables.",
      "internal/handler/flow_handler.go — one POST handler: decode and validate FlowRequest, call the service, encode FlowResponse; no business logic.",
      "internal/dto/flow.go — FlowRequest and FlowResponse structs with json tags and a Validate method.",
      "internal/service/flow_service.go — FlowService holding ALL of the flow's logic, decisions and loops; it depends on small interfaces for each client and repository so tests can fake them.",
      "internal/client/<system>_client.go — one client per external system, one method per call, using net/http with a timeout.",
      "internal/client/<system>_dto.go — request/response structs for every REST call of that system.",
      "internal/entity/<table>.go — one struct per database table.",
      "internal/repository/<table>_repository.go — one repository per table with the SQL queries the flow needs.",
      "internal/service/errors.go — one sentinel or typed error per failure outcome; the handler maps them to HTTP statuses.",
      "internal/service/flow_service_test.go — table-driven tests of FlowService with fake clients and repositories.",
    ],
    service: "internal/service/flow_service.go",
    test: "internal/service/flow_service_test.go",
  },
};

const FENCE_LANG: Record<TargetLanguage, string> = {
  python: "python",
  typescript: "typescript",
  go: "go",
  java: "java",
};

export interface GeneratedFile {
  path: string;
  content: string;
}

export function buildCodegenPrompt(spec: string, language: TargetLanguage): string {
  const layout = LAYOUTS[language];
  return [
    `You will be given a flowchart described as a structured list of nodes and directed edges.`,
    `Each node line starts with its [id]; each "->" line underneath it is an outgoing edge to the node with that id.`,
    `Turn it into a complete, runnable backend project in ${language} that exposes the flow as a REST endpoint.`,
    `Stack: ${layout.stack}`,
    ``,
    `Project layout (create every file that applies; <Placeholders> are names you choose from the flowchart):`,
    ...layout.files.map((file) => `- ${file}`),
    `- README.md — what the service does, how to configure and run it, the endpoint with an example request and response, and a table of every external REST call and database table it uses.`,
    ``,
    `How to read the flowchart:`,
    `- DATA nodes are the flow's inputs and state. Inputs become the fields of FlowRequest, typed sensibly (ids, emails, amounts, dates) and validated; state becomes local variables in the service.`,
    `- STEP [REST API CALL] nodes call an external system; STEP [DB CALL] nodes read or write a database table; STEP [LOGIC] nodes are plain code in the service.`,
    `- A STEP without a tag: infer its type from its label and description. Calling another system, service or API (e.g. "Call to Salesforce", "Verify with payment gateway") is a REST call; reading or writing a database, table or store (e.g. "Call CIAM DB", "Save order") is a DB call; anything else is logic.`,
    `- DECISION nodes become if/else in the service; the "yes"/"no" edge labels say which branch is which. An edge back to an earlier node is a loop, not recursion.`,
    `- The END reached on the success path produces FlowResponse. A STEP that rejects, denies or reports an error ends the flow with a failure: throw a dedicated exception that the error handler maps to a fitting HTTP status (e.g. 403, 404, 409, 422) with an error body.`,
    ``,
    `Rules for each layer:`,
    `- REST calls: group them by external system — one client per system, one method per call. Write each call in full: HTTP method, path (the given endpoint, otherwise a plausible one marked with a "TODO: confirm endpoint" comment), base URL and API key from config, Content-Type and Authorization headers, a timeout, the typed request body built from the flow's data, the typed response, and handling of non-2xx responses. Every call gets its own request model and response model, each in its own file, holding the fields the flowchart sends and reads; client methods take and return these models, never loose parameters or raw maps.`,
    `- DB calls: group them by table — one entity and one repository per table. Use the given table name, otherwise infer one from the step (e.g. "Call CIAM DB ... userId or Email" -> a users table). Give each entity an id, the columns the flow reads or writes with sensible types, and created/updated timestamps. Give each repository exactly the query methods the flow uses (e.g. find by userId or email). The service calls repositories directly: never wrap a database in a client class.`,
    `- The service holds all decisions and orchestration and nothing else: no HTTP code, no SQL. Name its public method after what the flow does.`,
    `- Treat SSNs, account numbers and similar identifiers as sensitive: never log them in full.`,
    `- The test covers every DECISION branch, with clients and repositories faked or mocked.`,
    `- Every file is complete and the files compile together as one project. No "..." or omitted sections; TODO comments only for real values the flowchart doesn't give (endpoints, credentials).`,
    ``,
    `Output format:`,
    `- Output ONLY fenced code blocks, no prose. One block per file, with the file's path from the project root after the language on the opening fence, e.g. \`\`\`${FENCE_LANG[language]} ${layout.service} or \`\`\`markdown README.md.`,
    `- Never put a triple-backtick fence inside a file (in README.md, indent examples by four spaces instead).`,
    ``,
    `Flowchart:`,
    spec,
  ].join("\n");
}

// A file path the model put on the opening fence: ```java src/main/java/.../FlowService.java
const FILE_NAME = /^[\w-]+(?:\/[\w-]+)*\.[\w.]+$/;
// ...or, when it doesn't, as a first-line comment: "# flow.py", "// file: Flow.java"
const NAME_COMMENT = /^(?:#|\/\/)\s*(?:file(?:name)?:\s*)?(\S+)\s*$/i;

const FENCE = /^\s*```([^`]*)$/;

/**
 * Finds the reply's fenced blocks line by line. Markdown files often hold
 * fenced examples of their own despite the prompt, so inside one an opening
 * fence with a language nests and a bare fence closes the innermost block.
 * A reply cut off at the output limit ends inside a block: that block is kept.
 */
function fencedBlocks(raw: string): { info: string; content: string }[] {
  const blocks: { info: string; content: string }[] = [];
  let open: { info: string; lines: string[]; markdown: boolean; depth: number } | undefined;
  for (const line of raw.split(/\r?\n/)) {
    const fence = line.match(FENCE);
    if (!open) {
      if (fence) {
        const info = fence[1].trim();
        open = { info, lines: [], markdown: /^(markdown|md)\b|\.md\b/i.test(info), depth: 0 };
      }
      continue;
    }
    if (fence && open.markdown && fence[1].trim()) open.depth++;
    else if (fence && open.depth > 0) open.depth--;
    else if (fence) {
      blocks.push({ info: open.info, content: open.lines.join("\n") });
      open = undefined;
      continue;
    }
    open.lines.push(line);
  }
  if (open) blocks.push({ info: open.info, content: open.lines.join("\n") });
  return blocks;
}

/**
 * Splits the model's reply into files. Models don't always follow the format,
 * so a name may also come from a first-line comment or a block holding only
 * the name; unnamed blocks fill the service file, then its test; a reply with
 * no fences at all is taken as the service file; and an unclosed last block
 * (a reply cut off mid-file) is kept as far as it got.
 */
export function extractFiles(raw: string, language: TargetLanguage): GeneratedFile[] {
  const { service, test } = LAYOUTS[language];
  const matches = fencedBlocks(raw);
  if (matches.length === 0) {
    const content = raw.trim();
    return content ? [{ path: service, content }] : [];
  }

  const files = new Map<string, string>();
  const unnamed = [service, test];
  let pendingName: string | undefined;
  matches.forEach((m, i) => {
    let content = m.content.trimEnd();
    if (FILE_NAME.test(content.trim())) {
      pendingName = content.trim();
      return;
    }
    let name = m.info.split(/\s+/).find((word) => FILE_NAME.test(word)) ?? pendingName;
    pendingName = undefined;
    const comment = content.split("\n", 1)[0].trim().match(NAME_COMMENT);
    if (comment && FILE_NAME.test(comment[1])) {
      name ??= comment[1];
      content = content.slice(content.indexOf("\n") + 1).replace(/^\s*\n/, "");
    }
    const path = name ?? unnamed.find((p) => !files.has(p)) ?? `part${i + 1}.${service.split(".").pop()}`;
    // The same name twice (e.g. a helper split out mid-file) belongs together.
    files.set(path, files.has(path) ? `${files.get(path)}\n\n${content}` : content);
  });
  return [...files].map(([path, content]) => ({ path, content })).filter((f) => f.content.trim());
}
