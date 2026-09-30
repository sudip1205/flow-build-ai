import { describe, it, expect } from "vitest";
import { toPromptSpec } from "@/lib/graph/toPromptSpec";
import { edge, graph, node } from "./fixtures";

describe("toPromptSpec", () => {
  it("renders a simple start->end graph", () => {
    const spec = toPromptSpec(graph([node("s", "start"), node("e", "end")], [edge("s", "e")]));
    expect(spec).toContain("START");
    expect(spec).toContain("END");
  });

  it("lists nodes in flow order with ids, regardless of drawing order", () => {
    const nodes = [
      node("e", "end", { label: "End" }),
      node("d", "decision", { label: "Big?", condition: "x > 10" }),
      node("s", "start"),
      node("big", "step", { label: "Shout", description: "print x loudly" }),
    ];
    const edges = [edge("s", "d"), edge("d", "e", "no"), edge("d", "big", "yes"), edge("big", "e")];
    const spec = toPromptSpec(graph(nodes, edges));

    expect(spec.split("\n")).toEqual([
      "- [s] START",
      "    -> d",
      '- [d] DECISION "Big?" (condition: x > 10)',
      "    -> [yes] big",
      "    -> [no] e",
      '- [big] STEP "Shout": print x loudly',
      "    -> e",
      "- [e] END",
    ]);
    // Same graph drawn in a different order gives the same spec.
    expect(toPromptSpec(graph([...nodes].reverse(), [...edges].reverse()))).toBe(spec);
  });

  it("tags steps with their type and endpoint or table", () => {
    const nodes = [
      node("s", "start"),
      node("crm", "step", { label: "Call to Salesforce", action: "api", resource: "POST /owners/verify" }),
      node("db", "step", { label: "Call CIAM DB", action: "db", resource: "users" }),
      node("calc", "step", { label: "Score", action: "logic" }),
      node("plain", "step", { label: "Notify" }),
      node("e", "end"),
    ];
    const edges = [edge("s", "crm"), edge("crm", "db"), edge("db", "calc"), edge("calc", "plain"), edge("plain", "e")];
    const spec = toPromptSpec(graph(nodes, edges));
    expect(spec).toContain('STEP [REST API CALL: POST /owners/verify] "Call to Salesforce"');
    expect(spec).toContain('STEP [DB CALL: table users] "Call CIAM DB"');
    expect(spec).toContain('STEP [LOGIC] "Score"');
    expect(spec).toContain('STEP "Notify"');
  });

  it("keeps back-edges so loops survive", () => {
    const spec = toPromptSpec(
      graph(
        [node("s", "start"), node("d", "decision"), node("w", "step"), node("e", "end")],
        [edge("s", "d"), edge("d", "w", "yes"), edge("d", "e", "no"), edge("w", "d")]
      )
    );
    expect(spec).toContain('- [w] STEP "w"\n    -> d');
  });
});
