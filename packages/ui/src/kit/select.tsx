import { useEffect, useRef, useState } from "react";
import { Popover, usePopover } from "./popover.tsx";

type SelectOption<T extends string> = { value: T; label: string };

/** The one arrow in the office that says "this opens", pointing the other way once it has. */
export function Chevron({ open }: { open: boolean }): React.JSX.Element {
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

/** One row of a list of choices: the current one is marked, not merely coloured. */
export function Option({
  label,
  hint,
  selected,
  active,
  mono = false,
  onHover,
  onPick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  active: boolean;
  mono?: boolean;
  onHover: () => void;
  onPick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${
        mono ? "font-mono" : ""
      } ${active ? "bg-line/70" : ""} ${selected ? "text-accent" : "text-muted"}`}
      onPointerEnter={onHover}
      onClick={onPick}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint === undefined ? null : (
        <span className="shrink-0 font-mono text-2xs text-faint">{hint}</span>
      )}
      {selected ? <span aria-hidden="true">✓</span> : null}
    </button>
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
  const list = useRef<HTMLDivElement>(null);
  const menu = usePopover(field, list);
  const [active, setActive] = useState(0);
  const current = options.findIndex((option) => option.value === value);
  const label = options[current]?.label ?? placeholder ?? "";

  useEffect(() => {
    if (menu.open) {
      list.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [menu.open, active]);

  const show = (): void => {
    setActive(Math.max(0, current));
    menu.start();
  };
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
    if (!menu.open) {
      if (step !== 0 || commit) {
        event.preventDefault();
        show();
      }
    } else if (step !== 0) {
      event.preventDefault();
      setActive((now) => Math.min(options.length - 1, Math.max(0, now + step)));
    } else if (commit) {
      event.preventDefault();
      pick(active);
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
        aria-expanded={menu.open}
        disabled={disabled || options.length === 0}
        className={`flex w-full items-center gap-2 rounded-lg border bg-ink/60 px-3 py-2 text-left text-sm disabled:pointer-events-none disabled:opacity-40 ${
          menu.open ? "border-accent/70" : "border-line hover:border-line-strong"
        }`}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (menu.open) {
            menu.close();
          } else {
            show();
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
        <Chevron open={menu.open} />
      </button>
      <Popover popover={menu} surface={list} className="p-1">
        {options.map((option, index) => (
          <Option
            key={option.value}
            label={option.label}
            selected={option.value === value}
            active={index === active}
            mono={mono}
            onHover={() => {
              setActive(index);
            }}
            onPick={() => {
              pick(index);
            }}
          />
        ))}
      </Popover>
    </>
  );
}
