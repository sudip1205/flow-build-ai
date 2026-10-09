"use client";

import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Shown on the right, e.g. "⌘S". Display only; the canvas binds the keys. */
  shortcut?: string;
  disabled?: boolean;
}

/** A menu entry: an item, a divider, or a small heading over the items below it. */
export type MenuEntry = MenuItem | "separator" | { heading: string };

export interface Menu {
  label: string;
  entries: MenuEntry[];
}

const isItem = (entry: MenuEntry): entry is MenuItem => typeof entry === "object" && "onSelect" in entry;

/**
 * A draw.io-style menu bar: click a title to open its menu, then hover or use
 * the arrow keys to move between menus and items. Escape or a click outside
 * closes it.
 */
export default function MenuBar({ menus, children }: { menus: Menu[]; children?: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const titleRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);

  const openMenu = (index: number, focusFirst = false) => {
    const next = (index + menus.length) % menus.length;
    setOpen(next);
    titleRefs.current[next]?.focus();
    if (focusFirst) requestAnimationFrame(() => items()[0]?.focus());
  };

  const close = () => {
    const index = open;
    setOpen(null);
    if (index !== null) titleRefs.current[index]?.focus();
  };

  const onTitleKeyDown = (index: number) => (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu(index, true);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = index + (e.key === "ArrowRight" ? 1 : -1);
      if (open === null) titleRefs.current[(next + menus.length) % menus.length]?.focus();
      else openMenu(next);
    } else if (e.key === "Escape") {
      close();
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    if (open === null) return;
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      openMenu(open + (e.key === "ArrowRight" ? 1 : -1), true);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="fb-menubar" ref={barRef}>
      <h1 className="fb-menubar__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-wordmark.jpg" alt="FlowBuild-AI" width={173} height={26} className="fb-menubar__logo" />
      </h1>
      <div role="menubar" aria-label="Main menu" className="fb-menubar__menus">
        {menus.map((menu, index) => (
          <div key={menu.label} className="fb-menubar__menu">
            <button
              ref={(el) => {
                titleRefs.current[index] = el;
              }}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === index}
              className={`fb-menubar__title${open === index ? " fb-menubar__title--open" : ""}`}
              onClick={() => (open === index ? setOpen(null) : openMenu(index))}
              onPointerEnter={() => open !== null && open !== index && openMenu(index)}
              onKeyDown={onTitleKeyDown(index)}
            >
              {menu.label}
            </button>
            {open === index && (
              <div ref={menuRef} role="menu" aria-label={menu.label} className="fb-menu" onKeyDown={onMenuKeyDown}>
                {menu.entries.map((entry, i) =>
                  entry === "separator" ? (
                    <div key={i} role="separator" className="fb-menu__separator" />
                  ) : isItem(entry) ? (
                    <button
                      key={i}
                      role="menuitem"
                      className="fb-menu__item"
                      disabled={entry.disabled}
                      onClick={() => {
                        setOpen(null);
                        entry.onSelect();
                      }}
                    >
                      <span>{entry.label}</span>
                      {entry.shortcut && <kbd className="fb-menu__shortcut">{entry.shortcut}</kbd>}
                    </button>
                  ) : (
                    <div key={i} role="presentation" className="fb-menu__heading">
                      {entry.heading}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
