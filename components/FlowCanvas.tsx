"use client";

import { useCallback, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import { nanoid } from "nanoid";
import { FlowNodeData, NodeKind, TargetLanguage } from "@/lib/graph/types";

const NODE_LABELS: Record<NodeKind, string> = {
  start: "Start",
  step: "Step",
  decision: "Decision",
  dataStore: "Data",
  end: "End",
};

const nextId = () => `n_${nanoid(6)}`;

export default function FlowCanvas() {
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>([
    {
      id: "start",
      type: "default",
      position: { x: 50, y: 150 },
      data: { kind: "start", label: "Start" },
    },
  ]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<Node<FlowNodeData> | null>(null);
  const [language, setLanguage] = useState<TargetLanguage>("python");
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as Node<FlowNodeData>[]),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      let label: string | undefined;
      if (sourceNode?.data.kind === "decision") {
        const existing = edges.filter((e) => e.source === connection.source);
        label = existing.length === 0 ? "yes" : "no";
      }
      setEdges((eds) => addEdge({ ...connection, label, id: nextId() }, eds));
    },
    [nodes, edges]
  );

  const addNode = (kind: NodeKind) => {
    const id = nextId();
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "default",
        position: { x: 250 + Math.random() * 200, y: 80 + Math.random() * 300 },
        data: { kind, label: NODE_LABELS[kind] },
      },
    ]);
  };

  const updateSelected = (patch: Partial<FlowNodeData>) => {
    if (!selected) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n))
    );
    setSelected((s) => (s ? { ...s, data: { ...s.data, ...patch } } : s));
  };

  const generate = async () => {
    setLoading(true);
    setError("");
    setCode("");
    try {
      const graph = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.data.kind,
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source!,
          target: e.target!,
          label: typeof e.label === "string" ? e.label : undefined,
        })),
      };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setCode(data.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 220, padding: 12, borderRight: "1px solid #ddd", overflowY: "auto" }}>
        <h3>FlowBuild-AI</h3>
        <p style={{ fontSize: 12, color: "#666" }}>Add nodes, connect them, generate code.</p>
        {(["step", "decision", "dataStore", "end"] as NodeKind[]).map((kind) => (
          <button
            key={kind}
            onClick={() => addNode(kind)}
            style={{ display: "block", width: "100%", marginBottom: 6 }}
          >
            + {NODE_LABELS[kind]}
          </button>
        ))}

        <hr />
        <label style={{ fontSize: 12 }}>Target language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as TargetLanguage)}
          style={{ width: "100%", marginBottom: 8 }}
        >
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
          <option value="go">Go</option>
        </select>
        <button onClick={generate} disabled={loading} style={{ width: "100%" }}>
          {loading ? "Generating..." : "Generate Code"}
        </button>
        {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}

        {selected && (
          <div style={{ marginTop: 16, borderTop: "1px solid #ddd", paddingTop: 8 }}>
            <strong style={{ fontSize: 12 }}>Edit: {selected.data.kind}</strong>
            <input
              style={{ width: "100%", marginTop: 4 }}
              value={selected.data.label}
              onChange={(e) => updateSelected({ label: e.target.value })}
              placeholder="Label"
            />
            {selected.data.kind !== "start" && selected.data.kind !== "end" && (
              <textarea
                style={{ width: "100%", marginTop: 4 }}
                value={selected.data.description || ""}
                onChange={(e) => updateSelected({ description: e.target.value })}
                placeholder="Description"
              />
            )}
            {selected.data.kind === "decision" && (
              <input
                style={{ width: "100%", marginTop: 4 }}
                value={selected.data.condition || ""}
                onChange={(e) => updateSelected({ condition: e.target.value })}
                placeholder="Condition (e.g. x > 10)"
              />
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelected(node as Node<FlowNodeData>)}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {code && (
        <div style={{ width: 420, borderLeft: "1px solid #ddd", padding: 12, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>Generated code</strong>
            <button onClick={() => navigator.clipboard.writeText(code)}>Copy</button>
          </div>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{code}</pre>
        </div>
      )}
    </div>
  );
}
