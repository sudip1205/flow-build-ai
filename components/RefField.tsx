"use client";

import { createContext, FocusEvent, Fragment, KeyboardEvent, ReactNode, RefObject, useContext, useRef, useState } from "react";
import { findReferences, referenceStatus } from "@/lib/graph/data";
import { DataObject } from "@/lib/graph/types";

/** The diagram's data objects, for suggesting and highlighting Name.field references. */
export const DataContext = createContext<DataObject[]>([]);

const MAX_SUGGESTIONS = 8;

interface Suggestion {
  text: string;
  type?: string;
}

/**
 * What to offer for the word being typed at the caret: "Ord" offers every
 * field of data objects starting with Ord, "Order.to" the fields of Order
 * starting with to.
 */
function suggest(value: string, caret: number, data: DataObject[]): { from: number; items: Suggestion[] } | null {
  const word = value.slice(0, caret).match(/([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z0-9_]*))?$/);
  if (!word) return null;
  const from = caret - word[0].length;
  if (value[from - 1] === ".") return null;
  const [, name, field] = word;
  const lower = (s: string) => s.toLowerCase();
  const objects =
    field === undefined
      ? data.filter((d) => lower(d.name).startsWith(lower(name)))
      : data.filter((d) => d.name === name);
  const items = objects
    .flatMap((d) =>
      d.fields
        .filter((f) => field === undefined || lower(f.name).startsWith(lower(field)))
        .map((f) => ({ text: `${d.name}.${f.name}`, type: f.type }))
    )
    .filter((s) => s.text !== word[0])
    .slice(0, MAX_SUGGESTIONS);
  return items.length ? { from, items } : null;
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

/**
 * A text input (or textarea) that suggests data references as you type.
 * Arrow keys move through the suggestions, Enter or Tab picks one, Escape
 * closes them; other keys go to onKeyDown as usual.
 */
export function RefField({
  value,
  onChange,
  multiline = false,
  rows = 3,
  className,
  placeholder,
  autoFocus,
  selectOnFocus,
  onBlur,
  onKeyDown,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  selectOnFocus?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<FieldElement>) => void;
  id?: string;
}) {
  const data = useContext(DataContext);
  const ref = useRef<FieldElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const found = caret === null ? null : suggest(value, caret, data);

  const track = (el: FieldElement) => setCaret(el.selectionStart === el.selectionEnd ? el.selectionStart : null);

  const pick = (s: Suggestion) => {
    if (!found || caret === null) return;
    const next = value.slice(0, found.from) + s.text + value.slice(caret);
    const at = found.from + s.text.length;
    onChange(next);
    setCaret(null);
    requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
  };

  const keyDown = (e: KeyboardEvent<FieldElement>) => {
    if (found) {
      const count = found.items.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(found.items[Math.min(active, count - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setCaret(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  const props = {
    id,
    className,
    placeholder,
    autoFocus,
    value,
    onChange: (e: { target: FieldElement }) => {
      onChange(e.target.value);
      track(e.target);
      setActive(0);
    },
    onKeyDown: keyDown,
    onKeyUp: (e: KeyboardEvent<FieldElement>) => {
      if (e.key.startsWith("Arrow") && e.key !== "ArrowUp" && e.key !== "ArrowDown") track(e.currentTarget);
    },
    onClick: (e: { currentTarget: FieldElement }) => track(e.currentTarget),
    onFocus: (e: FocusEvent<FieldElement>) => selectOnFocus && e.target.select(),
    onBlur: () => {
      setCaret(null);
      onBlur?.();
    },
  };

  return (
    <span className="fb-ref-field">
      {multiline ? (
        <textarea ref={ref as RefObject<HTMLTextAreaElement>} rows={rows} {...props} />
      ) : (
        <input ref={ref as RefObject<HTMLInputElement>} {...props} />
      )}
      {found && (
        <ul className="fb-ref-menu nodrag nowheel" role="listbox">
          {found.items.map((s, i) => (
            <li
              key={s.text}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : undefined}
              // Keep focus in the field so picking doesn't blur (and commit) it.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
            >
              <span>{s.text}</span>
              {s.type && <span className="fb-ref-menu__type">{s.type}</span>}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/** Text with its data references highlighted; a reference to a missing field is flagged. */
export function RefText({ text }: { text: string }) {
  const data = useContext(DataContext);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const ref of findReferences(text)) {
    const status = referenceStatus(ref, data);
    if (status === "not-data") continue;
    parts.push(text.slice(last, ref.index));
    parts.push(
      <span
        key={ref.index}
        className={status === "ok" ? "fb-ref" : "fb-ref fb-ref--bad"}
        title={status === "ok" ? undefined : `${ref.name} has no field "${ref.field}"`}
      >
        {text.slice(ref.index, ref.index + ref.length)}
      </span>
    );
    last = ref.index + ref.length;
  }
  parts.push(text.slice(last));
  return <>{parts.map((p, i) => (typeof p === "string" ? <Fragment key={`t${i}`}>{p}</Fragment> : p))}</>;
}
