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

  it("tags calls with their type, operation, target, input and output", () => {
    const nodes = [
      node("s", "start"),
      node("crm", "call", {
        label: "Verify owner",
        callType: "rest",
        operation: "POST",
        target: "/owners/verify",
        input: "Request.ownerId",
        output: "Owner.verified",
      }),
      node("db", "call", { label: "Load user", callType: "db", operation: "select", target: "users", description: "by email" }),
      node("q", "call", { label: "Announce", callType: "queue" }),
      node("calc", "step", { label: "Score" }),
      node("e", "end"),
    ];
    const edges = [edge("s", "crm"), edge("crm", "db"), edge("db", "q"), edge("q", "calc"), edge("calc", "e")];
    const spec = toPromptSpec(graph(nodes, edges));
    expect(spec).toContain(
      '- [crm] CALL [REST API: POST /owners/verify] "Verify owner" (input: Request.ownerId; output: Owner.verified)'
    );
    expect(spec).toContain('- [db] CALL [DATABASE: select table users] "Load user": by email');
    expect(spec).toContain('- [q] CALL [QUEUE] "Announce"');
    expect(spec).toContain('- [calc] STEP "Score"');
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
