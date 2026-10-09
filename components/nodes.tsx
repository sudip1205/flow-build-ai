"use client";

import { createContext, KeyboardEvent, memo, ReactNode, useContext, useState } from "react";
import { Handle, NodeProps, NodeResizer, NodeTypes, Position } from "reactflow";
import { CALL_TYPE_INFO } from "@/lib/graph/calls";
import { IDENTIFIER, Rename } from "@/lib/graph/data";
import { formatField, parseField } from "@/lib/graph/fields";
import { DATA_ROLES, DataObject, DataRole, FlowNodeData, NodeKind } from "@/lib/graph/types";
import { DataContext, RefField, RefText } from "./RefField";

export const NODE_LABELS: Record<NodeKind, string> = {
  start: "Start",
  step: "Step",
  call: "Call",
  decision: "Decision",
  end: "End",
};

/** What each kind is for, shown in the palette before a node is added. */
export const NODE_HINTS: Record<NodeKind, string> = {
  start: "Where the flow begins.",
  step: "Plain logic: calculate, check or transform something.",
  call: "A backend call: REST, GraphQL, database, queue, cache, email, SDK or AI.",
  decision: "A yes/no check that splits the flow, or repeats it as a loop.",
  end: "Where the flow finishes, optionally returning a result.",
};

/** A miniature of how each kind is drawn on the canvas, for the palette. */
export function NodeShape({ kind }: { kind: NodeKind }) {
  return (
    <svg className={`fb-shape fb-shape--${kind}`} viewBox="0 0 40 28" aria-hidden="true">
      {kind === "start" && <circle cx="20" cy="14" r="8" className="fb-shape__solid" />}
      {kind === "step" && <rect x="3" y="5" width="34" height="18" rx="7" className="fb-shape__outline" />}
      {kind === "decision" && <polygon points="20,2 38,14 20,26 2,14" className="fb-shape__outline" />}
      {kind === "call" && (
        <>
          <rect x="3" y="5" width="34" height="18" rx="7" className="fb-shape__outline" />
          <path d="M12 11.5h14l-3-3M28 16.5H14l3 3" className="fb-shape__line fb-shape__line--strong" />
        </>
      )}
      {kind === "end" && (
        <>
          <circle cx="20" cy="14" r="9.5" className="fb-shape__ring" />
          <circle cx="20" cy="14" r="5" className="fb-shape__solid" />
        </>
      )}
    </svg>
  );
}

/** A miniature data table (a header over rows), for the palette's data set button. */
export function DataSetShape() {
  return (
    <svg className="fb-shape fb-shape--data" viewBox="0 0 40 28" aria-hidden="true">
      <rect x="5" y="3" width="30" height="22" rx="3" className="fb-shape__outline" />
      <rect x="5" y="3" width="30" height="7" rx="3" className="fb-shape__solid" />
      <path d="M9 15h22M9 20h22" className="fb-shape__line" />
    </svg>
  );
}

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
}: {
  value: string;
  onCommit: (next: string) => void;
  className: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const stop = () => setDraft(null);

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
    return (
      <RefField
        className={`${className} fb-node__input nodrag nopan`}
        value={draft}
        placeholder={placeholder}
        multiline={multiline}
        rows={2}
        autoFocus
        selectOnFocus
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
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
      {value ? <RefText text={value} /> : <span className="fb-node__placeholder">{placeholder}</span>}
    </span>
  );
}

/** Drag handles on a selected node; the chosen size is saved with the diagram. */
function Resizer({
  selected,
  minWidth = 150,
  minHeight = 70,
}: {
  selected: boolean;
  minWidth?: number;
  minHeight?: number;
}) {
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

const ICONS: Record<"step" | "call", ReactNode> = {
  step: <path d="M5 3l14 9-14 9V3z" />,
  call: <path d="M4 8h15l-4-4M20 16H5l4 4" />,
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
  return <EditableText className={className} value={data.label} required onCommit={(label) => update(id, { label })} />;
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
    <div className={cls("step", selected)}>
      <Resizer selected={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="fb-node__header">
        <Icon kind="step" />
        <span>Action</span>
      </div>
      <Text id={id} data={data} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

/**
 * A backend call: an action with its call type, operation and target in the
 * header, and what it sends and keeps underneath.
 */
const CallNode = memo(function CallNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const callType = data.callType ?? "rest";
  const where = [data.operation, data.target].filter(Boolean).join(" ");
  return (
    <div className={`${cls("call", selected)} fb-node--call-${callType}`}>
      <Resizer selected={selected} />
      <Handle type="target" position={Position.Top} />
      <div className="fb-node__header">
        <Icon kind="call" />
        <span>{CALL_TYPE_INFO[callType].short}</span>
        {where && (
          <span className="fb-node__resource" title={where}>
            {where}
          </span>
        )}
      </div>
      <Text id={id} data={data} />
      {(data.input || data.output) && (
        <dl className="fb-node__io">
          {data.input && (
            <div>
              <dt>in</dt>
              <dd>
                <RefText text={data.input} />
              </dd>
            </div>
          )}
          {data.output && (
            <div>
              <dt>out</dt>
              <dd>
                <RefText text={data.output} />
              </dd>
            </div>
          )}
        </dl>
      )}
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

/** Canvas ids of data set tables, kept apart from flow node ids. */
export const DATA_NODE_PREFIX = "data:";

/** Lets a data set table save edits made on it, keep references to renamed names in step, and delete itself. */
export const DataSetEditContext = createContext<{
  update: (id: string, patch: Partial<DataObject>) => void;
  rename: (from: Rename, to: Rename) => void;
  remove: (id: string) => void;
}>({ update: () => {}, rename: () => {}, remove: () => {} });

const ROLE_HINTS: Record<DataRole, string> = {
  input: "Input: the request",
  state: "State: working values",
  output: "Output: the response",
  config: "Config: settings",
};

const NOT_AN_IDENTIFIER = "One word: letters, digits and _ only, not starting with a digit.";

/**
 * A one-line input inside a table. Enter saves when the text is valid (an
 * invalid value stays open, outlined, with the reason as its tooltip),
 * Escape cancels, and leaving it saves a valid value or drops the edit.
 */
function TableInput({
  initial,
  placeholder,
  className,
  validate,
  onCommit,
  onCancel,
}: {
  initial: string;
  placeholder?: string;
  className: string;
  validate: (text: string) => string | null;
  onCommit: (text: string, how: "enter" | "blur") => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const problem = validate(text.trim());
  return (
    <input
      className={`${className} fb-table__input nodrag nopan${problem && text.trim() ? " is-invalid" : ""}`}
      value={text}
      placeholder={placeholder}
      title={(text.trim() && problem) || undefined}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => (problem ? onCancel() : onCommit(text.trim(), "blur"))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
        else if (e.key === "Enter" && !problem) onCommit(text.trim(), "enter");
      }}
    />
  );
}

type TableEdit = { what: "name" } | { what: "field"; index: number } | { what: "new"; key: number };

/**
 * A data set drawn like an ERD table: its name and role over one row per
 * field. It has no handles, so nothing in the flow connects to it; nodes
 * only refer to its fields as Name.field. Everything is edited on the table:
 * the role from its pill, the name and rows by double-clicking them, and new
 * fields from "+ Add field" or a double-click anywhere else. A field is written "name: type = value";
 * Enter on a new one saves it and opens the next, and clearing a row
 * removes it.
 */
const DataTableNode = memo(function DataTableNode({ data, selected }: NodeProps<DataObject>) {
  const { update, rename, remove } = useContext(DataSetEditContext);
  const all = useContext(DataContext);
  const [edit, setEdit] = useState<TableEdit | null>(null);
  const stop = () => setEdit(null);
  const addField = () => setEdit({ what: "new", key: Date.now() });

  const nameProblem = (next: string) => {
    if (!IDENTIFIER.test(next)) return NOT_AN_IDENTIFIER;
    if (all.some((d) => d.id !== data.id && d.name === next)) return `There's already a data set named ${next}.`;
    return null;
  };

  /** A blank row is fine (it means remove, or stop adding); otherwise it needs a new, valid name. */
  const fieldProblem = (index: number | null) => (text: string) => {
    if (!text) return null;
    const { name } = parseField(text);
    if (!IDENTIFIER.test(name)) return NOT_AN_IDENTIFIER;
    if (data.fields.some((f, i) => i !== index && f.name === name)) return `${data.name} already has ${name}.`;
    return null;
  };

  const renameTo = (name: string) => {
    if (name !== data.name) {
      rename({ name: data.name }, { name });
      update(data.id, { name });
    }
    stop();
  };

  const saveField = (index: number, text: string) => {
    const old = data.fields[index];
    if (!text) update(data.id, { fields: data.fields.filter((_, i) => i !== index) });
    else {
      const field = parseField(text);
      if (field.name !== old.name) rename({ name: data.name, field: old.name }, { name: data.name, field: field.name });
      update(data.id, {
        fields: data.fields.map((f, i) => (i === index ? field : f)),
      });
    }
    stop();
  };

  const saveNew = (text: string, how: "enter" | "blur") => {
    if (text) update(data.id, { fields: [...data.fields, parseField(text)] });
    if (text && how === "enter") addField();
    else stop();
  };

  return (
    <div
      className={`fb-table fb-table--${data.role}${selected ? " is-selected" : ""}`}
      title={edit ? undefined : "Double-click to add a field"}
      onDoubleClick={(e) => {
        e.stopPropagation();
        addField();
      }}
    >
      <div className="fb-table__head">
        {edit?.what === "name" ? (
          <TableInput
            className="fb-table__name"
            initial={data.name}
            validate={nameProblem}
            onCommit={renameTo}
            onCancel={stop}
          />
        ) : (
          <span
            className="fb-table__name"
            title="Double-click to rename"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEdit({ what: "name" });
            }}
          >
            {data.name}
          </span>
        )}
        <select
          className="fb-table__role nodrag"
          aria-label={`${data.name} role`}
          title={ROLE_HINTS[data.role]}
          value={data.role}
          onChange={(e) => update(data.id, { role: e.target.value as DataRole })}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {DATA_ROLES.map((role) => (
            <option key={role} value={role} title={ROLE_HINTS[role]}>
              {role}
            </option>
          ))}
        </select>
        <button
          className="fb-table__delete nodrag"
          aria-label={`Delete ${data.name}`}
          title={`Delete ${data.name}`}
          onClick={() => remove(data.id)}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          ×
        </button>
      </div>
      {data.fields.length > 0 && (
        <dl className="fb-table__rows">
          {data.fields.map((f, i) =>
            edit?.what === "field" && edit.index === i ? (
              <div key={i} className="fb-table__row fb-table__row--editing">
                <TableInput
                  className="fb-table__field-input"
                  initial={formatField(f)}
                  placeholder="Clear to remove"
                  validate={fieldProblem(i)}
                  onCommit={(text) => saveField(i, text)}
                  onCancel={stop}
                />
              </div>
            ) : (
              <div
                key={i}
                className="fb-table__row"
                title="Double-click to edit; clear it to remove"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEdit({ what: "field", index: i });
                }}
              >
                <dt>{f.name}</dt>
                <dd>
                  {f.type && <span className="fb-table__type">{f.type}</span>}
                  {f.value && <span className="fb-table__value">= {f.value}</span>}
                </dd>
              </div>
            )
          )}
        </dl>
      )}
      {edit?.what === "new" ? (
        <div className="fb-table__row fb-table__row--editing fb-table__row--new">
          <TableInput
            key={edit.key}
            className="fb-table__field-input"
            initial=""
            placeholder="name: type = value"
            validate={fieldProblem(null)}
            onCommit={saveNew}
            onCancel={stop}
          />
        </div>
      ) : (
        <button className="fb-table__add nodrag" onClick={addField} onDoubleClick={(e) => e.stopPropagation()}>
          + Add field
        </button>
      )}
    </div>
  );
});

export const nodeTypes: NodeTypes = {
  dataTable: DataTableNode,
  start: StartNode,
  step: StepNode,
  call: CallNode,
  decision: DecisionNode,
  end: EndNode,
};
