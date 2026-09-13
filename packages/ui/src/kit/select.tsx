import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EXIT_MS } from "./motion.ts";

type SelectOption<T extends string> = { value: T; label: string };

/** The gap between the field and its list, and the list's bounds. */
const GAP = 6;
const MAX_MENU = 260;
const MIN_BELOW = 160;
const EDGE = 12;

type Box = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };
type Phase = "closed" | "open" | "closing";

/** Under the field when there is room for a list worth reading, over it when there is not. */
const place = (field: DOMRect): Box => {
  const below = window.innerHeight - field.bottom - EDGE;
  const above = field.top - EDGE;
  const drop = below >= MIN_BELOW || below >= above;
  return {
    left: field.left,
    width: field.width,
    maxHeight: Math.min(MAX_MENU, Math.max(below, above)),
    ...(drop ? { top: field.bottom + GAP } : { bottom: window.innerHeight - field.top + GAP }),
  };
};

type Dropdown = {
  phase: Phase;
  box: Box | null;
  active: number;
  setActive: (index: number) => void;
  start: (from: number) => void;
  close: () => void;
};

/**
 * When the list is on screen, where, and which row the keyboard is on. The list leaves on a clock rather
 * than on a transition event, so a dropped frame cannot strand it, and anything that moves the field
 * closes it, because a list placed once cannot follow.
 */
function useDropdown(field: RefObject<HTMLButtonElement | null>): Dropdown {
  const [phase, setPhase] = useState<Phase>("closed");
  const [box, setBox] = useState<Box | null>(null);
  const [active, setActive] = useState(0);
  const open = phase === "open";

  const close = (): void => {
    setPhase((now) => (now === "open" ? "closing" : now));
  };

  useEffect(() => {
    const timer =
      phase === "closing"
        ? setTimeout(() => {
            setPhase("closed");
          }, EXIT_MS)
        : null;
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [phase]);

  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (!(event.target instanceof Node) || field.current?.contains(event.target) !== true) {
        close();
      }
    };
    if (open) {
      document.addEventListener("pointerdown", outside);
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    }
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, field]);

  return {
    phase,
    box,
    active,
    setActive,
    close,
    start: (from) => {
      const rect = field.current?.getBoundingClientRect();
      if (rect !== undefined) {
        setBox(place(rect));
        setActive(Math.max(0, from));
        setPhase("open");
      }
    },
  };
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-[var(--duration-base)] ease-[var(--ease-soft)] ${
        open ? "-rotate-180" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

type MenuProps<T extends string> = {
  box: Box;
  options: readonly SelectOption<T>[];
  value: T | "";
  active: number;
  leaving: boolean;
  mono: boolean;
  onHover: (index: number) => void;
  onPick: (index: number) => void;
};

/** The list itself, in the document's own corner so no panel's overflow can cut it off. */
function Menu<T extends string>({
  box,
  options,
  value,
  active,
  leaving,
  mono,
  onHover,
  onPick,
}: MenuProps<T>): React.JSX.Element {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return createPortal(
    <div
      ref={list}
      role="listbox"
      style={box}
      className={`animate-pop fixed z-50 overflow-y-auto overscroll-contain rounded-xl border border-line-strong bg-raised p-1 shadow-lift ring-1 ring-white/[0.04] ring-inset ${
        leaving ? "[animation-direction:reverse]" : ""
      }`}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${
            mono ? "font-mono" : ""
          } ${index === active ? "bg-line/70" : ""} ${
            option.value === value ? "text-accent" : "text-muted"
          }`}
          onPointerEnter={() => {
            onHover(index);
          }}
          onClick={() => {
            onPick(index);
          }}
        >
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {option.value === value ? <span aria-hidden="true">✓</span> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}

type Props<T extends string> = {
  id?: string;
  /** The empty string means nothing is chosen yet, which is what the placeholder is for. */
  value: T | "";
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
};

/**
 * A select the office draws itself. The platform's own dropdown is a window rather than an element: it
 * cannot take the office's colours, its list is painted by the operating system and its arrow is
 * whatever that system feels like. This is a button and a list, so both match everything around them,
 * and the list can arrive and leave the way the rest of the office does.
 */
export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  mono = false,
}: Props<T>): React.JSX.Element {
  const field = useRef<HTMLButtonElement>(null);
  const menu = useDropdown(field);
  const open = menu.phase === "open";
  const current = options.findIndex((option) => option.value === value);
  const label = options[current]?.label ?? placeholder ?? "";

  const pick = (index: number): void => {
    const option = options[index];
    if (option !== undefined) {
      onChange(option.value);
    }
    menu.close();
    field.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const commit = event.key === "Enter" || event.key === " ";
    if (!open) {
      if (step !== 0 || commit) {
        event.preventDefault();
        menu.start(current);
      }
    } else if (step !== 0) {
      event.preventDefault();
      menu.setActive(Math.min(options.length - 1, Math.max(0, menu.active + step)));
    } else if (commit) {
      event.preventDefault();
      pick(menu.active);
    } else if (event.key === "Escape" || event.key === "Tab") {
      menu.close();
    }
  };

  return (
    <>
      <button
        ref={field}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled || options.length === 0}
        className={`flex w-full items-center gap-2 rounded-lg border bg-ink/60 px-3 py-2 text-left text-sm disabled:pointer-events-none disabled:opacity-40 ${
          open ? "border-accent/70" : "border-line hover:border-line-strong"
        }`}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (open) {
            menu.close();
          } else {
            menu.start(current);
          }
        }}
      >
        <span
          className={`min-w-0 flex-1 truncate ${mono ? "font-mono" : ""} ${
            current === -1 ? "text-faint" : "text-text"
          }`}
        >
          {label}
        </span>
        <Chevron open={open} />
      </button>
      {menu.phase === "closed" || menu.box === null ? null : (
        <Menu
          box={menu.box}
          options={options}
          value={value}
          active={menu.active}
          leaving={menu.phase === "closing"}
          mono={mono}
          onHover={menu.setActive}
          onPick={pick}
        />
      )}
    </>
  );
}
