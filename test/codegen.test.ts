import { describe, it, expect } from "vitest";
import { buildCodegenPrompt, extractFiles } from "@/lib/prompts/codegen";

const JAVA_SERVICE = "src/main/java/com/flowbuild/app/service/FlowService.java";
const JAVA_TEST = "src/test/java/com/flowbuild/app/service/FlowServiceTest.java";

describe("buildCodegenPrompt", () => {
  it("includes the spec and asks for a whole project with a README", () => {
    const prompt = buildCodegenPrompt("- [s] START", "go");
    expect(prompt).toContain("- [s] START");
    expect(prompt).toContain("go.mod");
    expect(prompt).toContain("table-driven tests");
    expect(prompt).toContain("```go internal/service/flow_service.go");
    expect(prompt).toContain("README.md");
  });

  it("lays Java out as Spring Boot layers: controller, DTOs, service, clients, entities, repositories", () => {
    const prompt = buildCodegenPrompt("- [s] START", "java");
    for (const part of [
      "pom.xml",
      "controller/FlowController.java",
      "dto/FlowRequest.java",
      "dto/FlowResponse.java",
      JAVA_SERVICE,
      "client/<System>Client.java",
      "client/dto/<System><Operation>Request.java",
      "entity/<Table>.java",
      "repository/<Table>Repository.java",
      "GlobalExceptionHandler.java",
      JAVA_TEST,
    ]) {
      expect(prompt).toContain(part);
    }
    expect(prompt).toContain("JpaRepository");
  });

  it("explains data objects, references, each call type and old-style call steps", () => {
    const prompt = buildCodegenPrompt("- [s] START", "python");
    expect(prompt).toContain('Role "input" objects become FlowRequest');
    expect(prompt).toContain("Name.field anywhere in the flow");
    for (const tag of ["REST API ->", "GRAPHQL ->", "GRPC ->", "DATABASE ->", "QUEUE ->", "CACHE ->", "EMAIL ->", "SDK ->", "LLM ->"]) {
      expect(prompt).toContain(tag);
    }
    expect(prompt).toContain('"Call to Salesforce"');
    expect(prompt).toContain('"Call CIAM DB"');
    expect(prompt).toContain("one entity and one repository per table");
    expect(prompt).toContain("app/repositories/<table>_repository.py");
  });
});

describe("extractFiles", () => {
  it("names files from the path on the opening fence", () => {
    const raw = `\`\`\`java ${JAVA_SERVICE}\nclass FlowService {}\n\`\`\`\n\`\`\`xml pom.xml\n<project/>\n\`\`\``;
    expect(extractFiles(raw, "java")).toEqual([
      { path: JAVA_SERVICE, content: "class FlowService {}" },
      { path: "pom.xml", content: "<project/>" },
    ]);
  });

  it("puts unnamed blocks in the service file, then its test", () => {
    const raw = "Here you go:\n```ts\nexport const a = 1;\n```\nand the test:\n```typescript\ntest('a', () => {});\n```";
    expect(extractFiles(raw, "typescript")).toEqual([
      { path: "src/services/flowService.ts", content: "export const a = 1;" },
      { path: "test/flowService.test.ts", content: "test('a', () => {});" },
    ]);
  });

  it("takes a reply with no fences as the service file", () => {
    expect(extractFiles("  print('hi')\n", "python")).toEqual([
      { path: "app/services/flow_service.py", content: "print('hi')" },
    ]);
    expect(extractFiles("   ", "python")).toEqual([]);
  });

  it("joins blocks that share a file name", () => {
    const raw = "```java Flow.java\nclass A {}\n```\n```java Flow.java\nclass B {}\n```";
    expect(extractFiles(raw, "java")).toEqual([{ path: "Flow.java", content: "class A {}\n\nclass B {}" }]);
  });

  it("takes a name from a block holding only the name, or a first-line comment", () => {
    const raw =
      "```python\napp/models/user.py\n```\n```python\nx = 1\n```\n```python\n# app/api/routes.py\n\nfrom app import x\n```";
    expect(extractFiles(raw, "python")).toEqual([
      { path: "app/models/user.py", content: "x = 1" },
      { path: "app/api/routes.py", content: "from app import x" },
    ]);
  });

  it("ignores fence words that aren't file names", () => {
    const raw = "```python title=../../etc/passwd\nx = 1\n```";
    expect(extractFiles(raw, "python")).toEqual([{ path: "app/services/flow_service.py", content: "x = 1" }]);
  });

  it("keeps fenced examples inside a README as part of it", () => {
    const raw = [
      "```java pom.xml",
      "<project/>",
      "```",
      "```markdown README.md",
      "# App",
      "```bash",
      "mvn spring-boot:run",
      "```",
      "Example:",
      "```json",
      '{ "a": 1 }',
      "```",
      "Done.",
      "```",
      "```java src/main/java/com/flowbuild/app/Application.java",
      "class Application {}",
      "```",
    ].join("\n");
    expect(extractFiles(raw, "java")).toEqual([
      { path: "pom.xml", content: "<project/>" },
      {
        path: "README.md",
        content: '# App\n```bash\nmvn spring-boot:run\n```\nExample:\n```json\n{ "a": 1 }\n```\nDone.',
      },
      { path: "src/main/java/com/flowbuild/app/Application.java", content: "class Application {}" },
    ]);
  });

  it("takes a name from the heading or bold line above a block", () => {
    const raw = [
      "Here is the project.",
      "### `pom.xml`",
      "```xml",
      "<project/>",
      "```",
      "**src/main/resources/application.yml**:",
      "```yaml",
      "server:",
      "  port: 8080",
      "```",
      "e.g. version 1.2 of the service:",
      "```python",
      "x = 1",
      "```",
    ].join("\n");
    expect(extractFiles(raw, "python").map((f) => f.path)).toEqual([
      "pom.xml",
      "src/main/resources/application.yml",
      "app/services/flow_service.py",
    ]);
  });

  it("places unnamed Java classes by package and class, and spots the build file and settings", () => {
    const raw = [
      "```xml",
      '<?xml version="1.0"?>',
      "<project>",
      "</project>",
      "```",
      "```yaml",
      "spring:",
      "  datasource: {}",
      "```",
      "```java",
      "package com.flowbuild.app.client.dto;",
      "",
      "public record CiamLookupRequest(String email) {}",
      "```",
      "FlowServiceTest.java",
      "```java",
      "package com.flowbuild.app.service;",
      "",
      "class FlowServiceTest {}",
      "```",
      "```java",
      "package com.flowbuild.app.entity;",
      "",
      "@Entity",
      "public class User {}",
      "```",
    ].join("\n");
    expect(extractFiles(raw, "java").map((f) => f.path)).toEqual([
      "pom.xml",
      "src/main/resources/application.yml",
      "src/main/java/com/flowbuild/app/client/dto/CiamLookupRequest.java",
      "src/test/java/com/flowbuild/app/service/FlowServiceTest.java",
      "src/main/java/com/flowbuild/app/entity/User.java",
    ]);
  });

  it("keeps the last file of a reply cut off mid-block", () => {
    const raw = "```go go.mod\nmodule github.com/flowbuild/app\n```\n```go internal/entity/user.go\npackage entity\n\ntype User struct {";
    expect(extractFiles(raw, "go")).toEqual([
      { path: "go.mod", content: "module github.com/flowbuild/app" },
      { path: "internal/entity/user.go", content: "package entity\n\ntype User struct {" },
    ]);
  });
});
