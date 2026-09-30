"use client";

import { createContext, KeyboardEvent, memo, ReactNode, useContext, useState } from "react";
import { Handle, NodeProps, NodeResizer, NodeTypes, Position } from "reactflow";
import { formatFields, parseFields } from "@/lib/graph/fields";
import { FlowNodeData, NodeKind, StepAction } from "@/lib/graph/types";

export const NODE_LABELS: Record<NodeKind, string> = {
  start: "Start",
  step: "Step",
  decision: "Decision",
  dataStore: "Data",
  end: "End",
};

/** What each kind is for, shown in the palette before a node is added. */
export const NODE_HINTS: Record<NodeKind, string> = {
  start: "Where the flow begins.",
  step: "An action: calculate, call, save or send something.",
  decision: "A yes/no check that splits the flow, or repeats it as a loop.",
  dataStore: "Variables the flow reads or updates, e.g. orders, total = 0.",
  end: "Where the flow finishes, optionally returning a result.",
};

export const STEP_ACTION_LABELS: Record<StepAction, string> = {
  logic: "Logic",
  api: "REST API call",
  db: "Database call",
};

// What a step's header says; an untyped step is a plain UML action.
const STEP_HEADERS: Record<StepAction, string> = { logic: "Action", api: "API call", db: "DB call" };

/** Lets a node write its own text back into the canvas state. */
export const NodeEditContext = createContext<(id: string, patch: Partial<FlowNodeData>) => void>(() => {});

/**
 * Text that turns into an input on double-click. Enter or blur saves, Escape
 * cancels; Shift+Enter adds a line break in multiline fields.
 */
function EditableText({
  value,
  onCommit,
  className,
  placeholder,
  multiline = false,
  required = false,
  startEditing = false,
  onDone,
}: {
  value: string;
  onCommit: (next: string) => void;
  className: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  startEditing?: boolean;
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(startEditing ? value : null);

  const stop = () => {
    setDraft(null);
    onDone?.();
  };

  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    if (next !== value && (next || !required)) onCommit(next);
    stop();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") stop();
    else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      commit();
    }
  };

  if (draft !== null) {
    const props = {
      className: `${className} fb-node__input nodrag nopan`,
      value: draft,
      placeholder,
      autoFocus: true,
      onFocus: (e: { target: HTMLInputElement | HTMLTextAreaElement }) => e.target.select(),
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown,
    };
    return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
  }

  return (
    <span
      className={className}
      title="Double-click to edit"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(value);
      }}
    >
      {value || <span className="fb-node__placeholder">{placeholder}</span>}
    </span>
  );
}

/** Drag handles on a selected node; the chosen size is saved with the diagram. */
function Resizer({ selected, minWidth = 150, minHeight = 70 }: { selected: boolean; minWidth?: number; minHeight?: number }) {
  return (
    <NodeResizer
      isVisible={selected}
      minWidth={minWidth}
      minHeight={minHeight}
      lineClassName="fb-resize-line"
      handleClassName="fb-resize-handle"
    />
  );
}

const cls = (kind: NodeKind, selected: boolean) => `fb-node fb-node--${kind}${selected ? " is-selected" : ""}`;

const ICONS: Record<"step" | "dataStore", ReactNode> = {
  step: <path d="M5 3l14 9-14 9V3z" />,
  dataStore: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
};

function Icon({ kind }: { kind: keyof typeof ICONS }) {
  return (
    <svg className="fb-node__icon" viewBox="0 0 24 24" aria-hidden>
      {ICONS[kind]}
    </svg>
  );
}

function Name({ id, data, className }: { id: string; data: FlowNodeData; className: string }) {
  const update = useContext(NodeEditContext);
  return (
    <EditableText className={className} value={data.label} required onCommit={(label) => update(id, { label })} />
  );
}

function Text({ id, data }: { id: string; data: FlowNodeData }) {
  const update = useContext(NodeEditContext);
  // Decisions show their condition when they have one, so that's what gets edited.
  const field = data.kind === "decision" && (data.condition || !data.description) ? "condition" : "description";
  return (
    <div className="fb-node__body">
      <Name id={id} data={data} className="fb-node__label" />
      <EditableText
        className="fb-node__detail"
        value={data[field] || ""}
        placeholder={field === "condition" ? "Add condition" : "Add description"}
        multiline
        onCommit={(text) => update(id, { [field]: text || undefined })}
      />
    </div>
  );
}

/** UML initial node: a solid dot, named alongside rather than inside. */
const StartNode = memo(function StartNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  return (
    <div className={cls("start", selected)} title={data.description}>
      <Name id={id} data={data} className="fb-node__name" />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

/** UML action: rounded rectangle. */
const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  return (
    <div className={`${cls("step", selected)}${data.action ? ` fb-node--${data.action}` : ""}`}>
      <Resizer selected={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="fb-node__header">
        <Icon kind="step" />
        <span>{STEP_HEADERS[data.action ?? "logic"]}</span>
        {data.resource && <span className="fb-node__resource" title={data.resource}>{data.resource}</span>}
      </div>
      <Text id={id} data={data} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

/**
 * The UML attribute compartment: one variable per line, "name = value".
 * Double-click turns it into a comma-separated text box.
 */
function Fields({ id, data }: { id: string; data: FlowNodeData }) {
  const update = useContext(NodeEditContext);
  const [editing, setEditing] = useState(false);
  const fields = parseFields(data.fields);
  const commit = (text: string) => update(id, { fields: formatFields(parseFields(text)) || undefined });

  if (editing || !fields.length) {
    return (
      <div className="fb-node__fields">
        <EditableText
          className="fb-node__fields-input"
          value={data.fields || ""}
          placeholder="Add variables (a, b = 0)"
          multiline
          startEditing={editing}
          onCommit={commit}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }
  return (
    <ul
      className="fb-node__fields"
      title="Double-click to edit (comma-separated)"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {fields.map((f, i) => (
        <li key={i}>
          <span className="fb-node__field-name">{f.name}</span>
          {f.value && <span className="fb-node__field-value"> = {f.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** UML object node with the «datastore» keyword. */
const DataNode = memo(function DataNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  return (
    <div className={cls("dataStore", selected)}>
      <Resizer selected={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="fb-node__header">
        <Icon kind="dataStore" />
        <span>«datastore»</span>
      </div>
      <Text id={id} data={data} />
      <Fields id={id} data={data} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

/**
 * UML decision: a diamond. It gets two named source handles, so the yes/no
 * label of an edge is decided by where you drag it from rather than by the
 * order you draw them.
 */
const DecisionNode = memo(function DecisionNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  return (
    <div className={cls("decision", selected)}>
      <Resizer selected={selected} minWidth={150} minHeight={100} />
      <svg className="fb-node__diamond" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="fb-diamond-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffbeb" />
            <stop offset="1" stopColor="#fef3c7" />
          </linearGradient>
        </defs>
        <polygon points="50,1 99,50 50,99 1,50" vectorEffect="non-scaling-stroke" />
      </svg>
      <Handle type="target" position={Position.Top} />
      <Text id={id} data={data} />
      <Handle id="yes" type="source" position={Position.Bottom} className="fb-handle--yes" />
      <span className="fb-handle-label fb-handle-label--yes">yes</span>
      <Handle id="no" type="source" position={Position.Right} className="fb-handle--no" />
      <span className="fb-handle-label fb-handle-label--no">no</span>
    </div>
  );
});

/** UML activity final: a bullseye. */
const EndNode = memo(function EndNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  return (
    <div className={cls("end", selected)} title={data.description}>
      <Handle type="target" position={Position.Top} />
      <Name id={id} data={data} className="fb-node__name" />
    </div>
  );
});

export const nodeTypes: NodeTypes = {
  start: StartNode,
  step: StepNode,
  decision: DecisionNode,
  dataStore: DataNode,
  end: EndNode,
};
