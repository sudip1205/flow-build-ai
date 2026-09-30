"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { nanoid } from "nanoid";
import {
  FlowGraph,
  FlowNodeData,
  LANGUAGE_LABELS,
  NodeKind,
  STEP_ACTIONS,
  StepAction,
  TARGET_LANGUAGES,
  TargetLanguage,
} from "@/lib/graph/types";
import { validateGraph } from "@/lib/graph/validate";
import { copyNodes, deserializeClip, pasteNodes, serializeClip } from "@/lib/graph/clipboard";
import { EMPTY_DIAGRAM, EXAMPLE_DIAGRAM } from "@/lib/examples";
import {
  DIAGRAM_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  deserializeDiagram,
  readStorage,
  serializeDiagram,
  writeStorage,
} from "@/lib/storage";
import { toPromptSpec } from "@/lib/graph/toPromptSpec";
import { buildCodegenPrompt } from "@/lib/prompts/codegen";
import { download } from "@/lib/download";
import { NODE_HINTS, NODE_LABELS, NodeEditContext, STEP_ACTION_LABELS, nodeTypes } from "./nodes";
import BuildStudio, { BuildRun } from "./BuildStudio";

type RFNode = Node<FlowNodeData>;

interface ProviderSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const EMPTY_SETTINGS: ProviderSettings = { provider: "", baseUrl: "", model: "", apiKey: "" };

const nextId = () => `n_${nanoid(6)}`;

const ASSIST_EXAMPLES = [
  "Build a flow that sums the paid orders in a list",
  "Which node should I use for a counter?",
  "Add a step that logs each order before checking it",
];

// Mirrors --edge / --yes / --no in globals.css; SVG markers can't read CSS variables.
const EDGE_COLORS = { default: "#94a3b8", yes: "#16a34a", no: "#dc2626" };

function styledEdge(edge: { id: string; source: string; target: string; label?: string }): Edge {
  const branch = edge.label === "yes" || edge.label === "no" ? edge.label : undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: branch ?? null,
    // UML shows branch labels as guards: [yes] / [no]. The raw label is kept
    // in data so it round-trips unchanged.
    label: branch ? `[${branch}]` : edge.label,
    data: { label: edge.label },
    className: branch ? `fb-edge--${branch}` : undefined,
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: EDGE_COLORS[branch ?? "default"] },
  };
}

/** A resized node carries its size as style, plus a class that lets its card fill it. */
const sizedProps = (size?: { width: number; height: number }) =>
  size ? { style: { width: size.width, height: size.height }, className: "fb-sized" } : { style: undefined, className: undefined };

function nodeSize(n: RFNode) {
  const width = n.style?.width;
  const height = n.style?.height;
  return typeof width === "number" && typeof height === "number"
    ? { size: { width: Math.round(width), height: Math.round(height) } }
    : {};
}

function toReactFlow(graph: FlowGraph): { nodes: RFNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      position: n.position,
      data: n.data,
      ...sizedProps(n.size),
    })),
    edges: graph.edges.map(styledEdge),
  };
}

function fromReactFlow(nodes: RFNode[], edges: Edge[]): FlowGraph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.kind, position: n.position, data: n.data, ...nodeSize(n) })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.data?.label === "string" ? e.data.label : undefined,
    })),
  };
}

export default function FlowCanvas() {
  const [nodes, setNodes] = useState<RFNode[]>(() => toReactFlow(EMPTY_DIAGRAM).nodes);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [language, setLanguage] = useState<TargetLanguage>("python");
  const [settings, setSettings] = useState<ProviderSettings>(EMPTY_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  const [run, setRun] = useState<BuildRun | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const [assistInput, setAssistInput] = useState("");
  const [assistReply, setAssistReply] = useState("");
  const [assistError, setAssistError] = useState("");
  const [assistLoading, setAssistLoading] = useState(false);
  const [beforeAssist, setBeforeAssist] = useState<FlowGraph | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const assistAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);

  const graph = useMemo(() => fromReactFlow(nodes, edges), [nodes, edges]);
  const validation = useMemo(() => validateGraph(graph), [graph]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const loadDiagram = useCallback((next: FlowGraph, nextLanguage?: TargetLanguage) => {
    const rf = toReactFlow(next);
    setNodes(rf.nodes);
    setEdges(rf.edges);
    setSelectedId(null);
    if (nextLanguage) setLanguage(nextLanguage);
    // Wait for React Flow to measure the new nodes before fitting them.
    setTimeout(() => flowRef.current?.fitView({ padding: 0.2 }), 50);
  }, []);

  // Restore the last diagram and this tab's provider settings after mount
  // (reading storage during render would mismatch the server-rendered HTML).
  useEffect(() => {
    const saved = readStorage("local", DIAGRAM_STORAGE_KEY);
    if (saved) {
      const diagram = deserializeDiagram(saved);
      if (!("error" in diagram)) loadDiagram(diagram.graph, diagram.language);
    }
    const savedSettings = readStorage("session", SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      try {
        setSettings({ ...EMPTY_SETTINGS, ...JSON.parse(savedSettings) });
      } catch {
        // ignore corrupt settings
      }
    }
    setHydrated(true);
  }, [loadDiagram]);

  useEffect(() => {
    if (hydrated) writeStorage("local", DIAGRAM_STORAGE_KEY, serializeDiagram({ graph, language }));
  }, [graph, language, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const hasSettings = Object.values(settings).some(Boolean);
    writeStorage("session", SETTINGS_STORAGE_KEY, hasSettings ? JSON.stringify(settings) : null);
  }, [settings, hydrated]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      // The Start node is required, so it can't be deleted.
      const allowed = changes.filter(
        (c) => !(c.type === "remove" && nds.find((n) => n.id === c.id)?.data.kind === "start")
      );
      const next = applyNodeChanges(allowed, nds) as RFNode[];
      // NodeResizer reports its drags as dimension changes that set style.width/height.
      if (!allowed.some((c) => c.type === "dimensions" && c.resizing)) return next;
      return next.map((n) => (n.style?.width && !n.className ? { ...n, className: "fb-sized" } : n));
    });
  }, []);

  const resetSize = (id: string) =>
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, ...sizedProps(undefined), width: undefined, height: undefined } : n)));

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const isDecision = sourceNode?.data.kind === "decision";
      const label = isDecision ? connection.sourceHandle ?? undefined : undefined;

      // Every node has a single way out (or one per yes/no branch), so a new
      // connection from the same handle replaces the old one.
      setEdges((eds) => [
        ...eds.filter(
          (e) =>
            !(e.source === connection.source && (!isDecision || e.sourceHandle === connection.sourceHandle))
        ),
        styledEdge({ id: nextId(), source: connection.source!, target: connection.target!, label }),
      ]);
    },
    [nodes]
  );

  const addNode = (kind: NodeKind) => {
    const id = nextId();
    const center = flowRef.current?.project({ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 });
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      {
        id,
        type: kind,
        selected: true,
        position: {
          x: (center?.x ?? 250) + Math.random() * 60 - 30,
          y: (center?.y ?? 150) + Math.random() * 60 - 30,
        },
        data: { kind, label: kind === "end" ? "End" : `New ${NODE_LABELS[kind].toLowerCase()}` },
      },
    ]);
    setSelectedId(id);
  };

  const updateNode = useCallback((id: string, patch: Partial<FlowNodeData>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, []);

  const updateSelected = (patch: Partial<FlowNodeData>) => {
    if (selectedId) updateNode(selectedId, patch);
  };

  // What Copy last took. Kept here as well as on the system clipboard so the
  // Paste button works without asking for clipboard-read permission.
  const clipRef = useRef<FlowGraph | null>(null);
  // The text this tab last put on the system clipboard, to tell our own copy
  // (paste the cascaded clipRef) from one made in another tab.
  const clipTextRef = useRef("");
  const [hasClip, setHasClip] = useState(false);
  const selectedIds = useMemo(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes]);

  /** Copies the selected nodes (and edges between them); returns what was copied. */
  const copySelection = useCallback(() => {
    const clip = copyNodes(graph, selectedIds);
    if (!clip.nodes.length) return null;
    clipRef.current = clip;
    setHasClip(true);
    return clip;
  }, [graph, selectedIds]);

  const pasteClip = useCallback((clip: FlowGraph) => {
    const pasted = pasteNodes(clip, nextId);
    const { nodes: newNodes, edges: newEdges } = toReactFlow(pasted);
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes.map((n) => ({ ...n, selected: true }))]);
    setEdges((eds) => [...eds, ...newEdges]);
    setSelectedId(newNodes.length === 1 ? newNodes[0].id : null);
    // Pasting again cascades from this copy instead of stacking on it.
    clipRef.current = pasted;
    setHasClip(true);
  }, []);

  const removeNodes = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setNodes((nds) => nds.filter((n) => !gone.has(n.id)));
    setEdges((eds) => eds.filter((e) => !gone.has(e.source) && !gone.has(e.target)));
    setSelectedId(null);
  }, []);

  const duplicateSelection = () => {
    const clip = copySelection();
    if (clip) pasteClip(clip);
  };

  // ⌘C / ⌘X / ⌘V (Ctrl on Windows) on the canvas. Text fields keep their own
  // copy and paste. Copied nodes also go on the system clipboard as JSON, so
  // they can be pasted into another FlowBuild tab.
  useEffect(() => {
    const inTextField = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

    const onCopyOrCut = (e: ClipboardEvent) => {
      if (inTextField(e.target) || window.getSelection()?.toString()) return;
      const clip = copySelection();
      if (!clip) return;
      e.preventDefault();
      clipTextRef.current = serializeClip(clip);
      e.clipboardData?.setData("text/plain", clipTextRef.current);
      if (e.type === "cut") removeNodes(clip.nodes.map((n) => n.id));
      setNotice(`${e.type === "cut" ? "Cut" : "Copied"} ${clip.nodes.length} node${clip.nodes.length > 1 ? "s" : ""}.`);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (inTextField(e.target)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const clip = (text === clipTextRef.current ? null : deserializeClip(text)) ?? clipRef.current;
      if (!clip) return;
      e.preventDefault();
      pasteClip(clip);
    };

    document.addEventListener("copy", onCopyOrCut);
    document.addEventListener("cut", onCopyOrCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopyOrCut);
      document.removeEventListener("cut", onCopyOrCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [copySelection, pasteClip, removeNodes]);

  const deleteSelected = () => {
    if (!selected || selected.data.kind === "start") return;
    setNodes((nds) => nds.filter((n) => n.id !== selected.id));
    setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelectedId(null);
  };

  const generate = async () => {
    if (!validation.valid) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // The first three steps run here, instantly; the server repeats them and
    // sends back its own spec and prompt, which replace these.
    const spec = toPromptSpec(graph);
    const runId = Date.now();
    const update = (patch: Partial<BuildRun>) =>
      setRun((current) => (current?.id === runId ? { ...current, ...patch } : current));
    setRun({
      id: runId,
      language,
      graphJson: JSON.stringify(graph, null, 2),
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      spec,
      prompt: buildCodegenPrompt(spec, language),
      startedAt: runId,
      status: "running",
      files: [],
    });
    setBuildOpen(true);

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph, language, providerOverride: providerOverride() }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Generation failed (${res.status}).`);
      update({
        status: "done",
        files: data.files,
        spec: data.spec,
        prompt: data.prompt,
        raw: data.raw,
        truncated: data.truncated,
        model: data.model,
        durationMs: data.durationMs,
      });
    } catch (e) {
      if (controller.signal.aborted) {
        update({ status: "error", error: "Cancelled.", durationMs: Date.now() - runId });
        return;
      }
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      update({ status: "error", error: message, durationMs: Date.now() - runId });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const providerOverride = () => (Object.values(settings).some(Boolean) ? settings : undefined);

  const askAssistant = async () => {
    const request = assistInput.trim();
    if (!request || assistLoading) return;
    const controller = new AbortController();
    assistAbortRef.current = controller;
    const before = graph;

    setAssistLoading(true);
    setAssistError("");
    setAssistReply("");
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, graph: before, providerOverride: providerOverride() }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Assistant failed (${res.status}).`);
      setAssistReply(data.reply);
      if (data.graph) {
        setBeforeAssist(before);
        loadDiagram(data.graph);
        setAssistInput("");
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setAssistError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (assistAbortRef.current === controller) {
        assistAbortRef.current = null;
        setAssistLoading(false);
      }
    }
  };

  const cancelAssistant = () => {
    assistAbortRef.current?.abort();
    assistAbortRef.current = null;
    setAssistLoading(false);
  };

  const undoAssistant = () => {
    if (!beforeAssist) return;
    loadDiagram(beforeAssist);
    setBeforeAssist(null);
    setAssistReply("");
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  /**
   * Saves the diagram as a .json file. Where the browser supports it the user
   * picks the name and folder; elsewhere it falls back to a download.
   */
  const saveDiagram = useCallback(async () => {
    const content = serializeDiagram({ graph, language });
    const picker = (window as { showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker;
    if (!picker) {
      download(content, "flowbuild-diagram.json", "application/json");
      return;
    }
    try {
      const handle = await picker({
        suggestedName: "flowbuild-diagram.json",
        types: [{ description: "FlowBuild diagram", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      setNotice(`Saved ${handle.name}.`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Couldn't save the file.");
    }
  }, [graph, language]);

  // Cmd/Ctrl+S saves the diagram instead of the web page.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveDiagram();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveDiagram]);

  const importDiagram = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const diagram = deserializeDiagram(await file.text());
    if ("error" in diagram) {
      setNotice(diagram.error);
      return;
    }
    loadDiagram(diagram.graph, diagram.language);
    setNotice(`Loaded ${file.name}.`);
  };

  const resetDiagram = () => {
    if (!window.confirm("Clear the canvas? This can't be undone.")) return;
    loadDiagram(EMPTY_DIAGRAM);
    setNotice("");
  };

  return (
    <div className="fb-app">
      <aside className="fb-sidebar" aria-label="Diagram tools">
        <header>
          <h1 className="fb-title">FlowBuild-AI</h1>
          <p className="fb-muted">
            Add nodes, drag between handles to connect them, then generate code. Decisions have a{" "}
            <span className="fb-yes">yes</span> handle (bottom) and a <span className="fb-no">no</span>{" "}
            handle (right). Double-click any text on a node to edit it. Shift-drag to select several nodes;
            ⌘C / ⌘V copies and pastes them.
          </p>
        </header>

        <section className="fb-section fb-assist" aria-label="AI assistant">
          <h2 className="fb-section__title">AI assistant</h2>
          <textarea
            className="fb-assist__input"
            rows={3}
            value={assistInput}
            onChange={(e) => setAssistInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) askAssistant();
            }}
            placeholder="Describe the flow you want, ask for a change, or ask which node to use…"
            disabled={assistLoading}
          />
          {!assistInput && !assistReply && (
            <div className="fb-assist__examples">
              {ASSIST_EXAMPLES.map((example) => (
                <button key={example} className="fb-chip" onClick={() => setAssistInput(example)}>
                  {example}
                </button>
              ))}
            </div>
          )}
          {assistLoading ? (
            <button className="fb-btn fb-btn--block" onClick={cancelAssistant}>
              <span className="fb-spinner" aria-hidden /> Thinking… (cancel)
            </button>
          ) : (
            <button
              className="fb-btn fb-btn--primary fb-btn--block"
              onClick={askAssistant}
              disabled={!assistInput.trim()}
              title="⌘/Ctrl + Enter"
            >
              Ask AI
            </button>
          )}
          <div aria-live="polite">
            {assistReply && (
              <div className="fb-assist__reply">
                <p>{assistReply}</p>
                {beforeAssist && (
                  <button className="fb-btn" onClick={undoAssistant}>
                    Undo AI change
                  </button>
                )}
              </div>
            )}
            {assistError && <p className="fb-error">{assistError}</p>}
          </div>
        </section>

        <section className="fb-section">
          <h2 className="fb-section__title">Add node</h2>
          <div className="fb-palette">
            {(["step", "decision", "dataStore", "end"] as NodeKind[]).map((kind) => (
              <button key={kind} className={`fb-btn fb-palette__btn fb-palette__btn--${kind}`} onClick={() => addNode(kind)}>
                <span className="fb-palette__name">+ {NODE_LABELS[kind]}</span>
                <span className="fb-palette__hint">{NODE_HINTS[kind]}</span>
              </button>
            ))}
          </div>
        </section>

        {selected && (
          <section className="fb-section" aria-label="Selected node">
            <h2 className="fb-section__title">Edit {NODE_LABELS[selected.data.kind]}</h2>
            <label className="fb-field">
              <span>Label</span>
              <input value={selected.data.label} onChange={(e) => updateSelected({ label: e.target.value })} />
            </label>
            {selected.data.kind === "decision" && (
              <label className="fb-field">
                <span>Condition</span>
                <input
                  value={selected.data.condition || ""}
                  onChange={(e) => updateSelected({ condition: e.target.value })}
                  placeholder="e.g. x > 10"
                />
              </label>
            )}
            {selected.data.kind === "step" && (
              <>
                <label className="fb-field">
                  <span>Step type</span>
                  <select
                    value={selected.data.action ?? ""}
                    onChange={(e) => updateSelected({ action: (e.target.value as StepAction) || undefined })}
                  >
                    <option value="">Auto (inferred from the text)</option>
                    {STEP_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {STEP_ACTION_LABELS[action]}
                      </option>
                    ))}
                  </select>
                </label>
                {(selected.data.action === "api" || selected.data.action === "db") && (
                  <label className="fb-field">
                    <span>{selected.data.action === "api" ? "Endpoint" : "Table"}</span>
                    <input
                      value={selected.data.resource || ""}
                      onChange={(e) => updateSelected({ resource: e.target.value || undefined })}
                      placeholder={selected.data.action === "api" ? "e.g. POST /v1/accounts/verify" : "e.g. users"}
                    />
                  </label>
                )}
              </>
            )}
            {selected.data.kind === "dataStore" && (
              <label className="fb-field">
                <span>Variables</span>
                <input
                  value={selected.data.fields || ""}
                  onChange={(e) => updateSelected({ fields: e.target.value || undefined })}
                  placeholder="e.g. orders, total = 0, count = 0"
                />
              </label>
            )}
            {selected.data.kind !== "start" && selected.data.kind !== "end" && (
              <label className="fb-field">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={selected.data.description || ""}
                  onChange={(e) => updateSelected({ description: e.target.value })}
                  placeholder={
                    selected.data.kind === "dataStore" ? "What this variable holds" : "What this step does"
                  }
                />
              </label>
            )}
            {selected.style?.width !== undefined && (
              <button className="fb-btn" onClick={() => resetSize(selected.id)}>
                Reset size
              </button>
            )}
            {selected.data.kind !== "start" && (
              <button className="fb-btn fb-btn--danger" onClick={deleteSelected}>
                Delete node
              </button>
            )}
          </section>
        )}

        <section className="fb-section">
          <h2 className="fb-section__title">Generate</h2>
          <label className="fb-field">
            <span>Target language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as TargetLanguage)}>
              {TARGET_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          </label>
          {loading ? (
            <button className="fb-btn fb-btn--block" onClick={cancel}>
              <span className="fb-spinner" aria-hidden /> Generating… (cancel)
            </button>
          ) : (
            <button
              className="fb-btn fb-btn--primary fb-btn--block"
              onClick={generate}
              disabled={!validation.valid}
            >
              Generate code
            </button>
          )}
          {run && !buildOpen && (
            <button className="fb-btn fb-btn--block fb-studio-toggle" onClick={() => setBuildOpen(true)}>
              Show last build
            </button>
          )}
          <div aria-live="polite">
            {!validation.valid && (
              <ul className="fb-issues">
                {validation.errors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
            {error && <p className="fb-error">{error}</p>}
          </div>
        </section>

        <details className="fb-section fb-settings">
          <summary className="fb-section__title">Model settings</summary>
          <p className="fb-muted">
            Optional. Leave blank to use the server&apos;s configured model. Values are kept in this tab
            only and sent with each request — the server never stores them.
          </p>
          <label className="fb-field">
            <span>Provider</span>
            <select value={settings.provider} onChange={(e) => setSettings({ ...settings, provider: e.target.value })}>
              <option value="">Server default</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </label>
          {settings.provider !== "anthropic" && (
            <label className="fb-field">
              <span>Base URL</span>
              <input
                value={settings.baseUrl}
                onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                placeholder="https://openrouter.ai/api/v1"
              />
            </label>
          )}
          <label className="fb-field">
            <span>Model</span>
            <input
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              placeholder={settings.provider === "anthropic" ? "claude-opus-5" : "model name"}
            />
          </label>
          <label className="fb-field">
            <span>API key</span>
            <input
              type="password"
              autoComplete="off"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            />
          </label>
          <button className="fb-btn" onClick={() => setSettings(EMPTY_SETTINGS)}>
            Clear settings
          </button>
        </details>

        <section className="fb-section">
          <h2 className="fb-section__title">Diagram</h2>
          <div className="fb-row">
            <button className="fb-btn fb-btn--primary" onClick={saveDiagram} title="Save as JSON (⌘S / Ctrl+S)">
              Save as JSON
            </button>
            <button className="fb-btn" onClick={() => fileInputRef.current?.click()}>Open JSON</button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={importDiagram} />
          </div>
          <div className="fb-row">
            <button
              className="fb-btn"
              disabled={!copyNodes(graph, selectedIds).nodes.length}
              onClick={() => {
                const clip = copySelection();
                if (clip) setNotice(`Copied ${clip.nodes.length} node${clip.nodes.length > 1 ? "s" : ""}.`);
              }}
              title="Copy selected nodes (⌘C / Ctrl+C)"
            >
              Copy
            </button>
            <button
              className="fb-btn"
              disabled={!hasClip}
              onClick={() => clipRef.current && pasteClip(clipRef.current)}
              title="Paste nodes (⌘V / Ctrl+V)"
            >
              Paste
            </button>
            <button
              className="fb-btn"
              disabled={!copyNodes(graph, selectedIds).nodes.length}
              onClick={duplicateSelection}
              title="Copy and paste the selected nodes in one go"
            >
              Duplicate
            </button>
          </div>
          <div className="fb-row">
            <button className="fb-btn" onClick={() => loadDiagram(EXAMPLE_DIAGRAM)}>Load example</button>
            <button className="fb-btn" onClick={resetDiagram}>Clear</button>
          </div>
          <p className="fb-muted" aria-live="polite">{notice || "Autosaved in this browser."}</p>
        </section>
      </aside>

      <main className="fb-canvas">
        <NodeEditContext.Provider value={updateNode}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={(c) => c.source !== c.target}
            onSelectionChange={({ nodes: sel }) => setSelectedId(sel.length === 1 ? sel[0].id : null)}
            onInit={(instance) => (flowRef.current = instance)}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
            <Controls />
          </ReactFlow>
        </NodeEditContext.Provider>
      </main>

      {run && buildOpen && (
        <BuildStudio run={run} onCancel={cancel} onRegenerate={generate} onClose={() => setBuildOpen(false)} />
      )}
    </div>
  );
}
