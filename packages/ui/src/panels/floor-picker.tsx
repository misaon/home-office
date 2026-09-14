import type { Project } from "@ho/protocol";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, usePopover } from "../kit/popover.tsx";
import { Chevron, Option } from "../kit/select.tsx";
import { sortedFloors, useUi } from "../store.ts";

const MENU_WIDTH = 300;

/** Name and repository both, so two floors with the same name are still told apart by what they are. */
const haystack = (floor: Project): string =>
  `${floor.name} ${floor.repo.kind === "local" ? floor.repo.path : floor.repo.url}`.toLowerCase();

/**
 * Which floor the office is showing. A row of tabs is fine for three projects and unusable for thirty,
 * so this is one button and a list you can type into.
 */
export function FloorPicker(): React.JSX.Element {
  const { t } = useTranslation();
  const projects = useUi((s) => s.snapshot.projects);
  const floorId = useUi((s) => s.floorId);
  const selectFloor = useUi((s) => s.selectFloor);
  const button = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const menu = usePopover(button, surface, { width: MENU_WIDTH });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const floors = sortedFloors(projects);
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? floors : floors.filter((p) => haystack(p).includes(needle));
  const current = floors.findIndex((p) => p.id === floorId);
  const label = floors[current]?.name ?? t("project.floors");

  useEffect(() => {
    if (menu.open) {
      search.current?.focus();
    }
  }, [menu.open]);

  const show = (): void => {
    setQuery("");
    setActive(Math.max(0, current));
    menu.start();
  };
  const pick = (index: number): void => {
    const floor = shown[index];
    if (floor !== undefined) {
      selectFloor(floor.id);
    }
    menu.close();
    button.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      setActive((now) => Math.min(shown.length - 1, Math.max(0, now + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      menu.close();
      button.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        title={label}
        className={`flex max-w-56 shrink-0 items-center gap-2 rounded-lg border border-accent/50 bg-accent-soft px-3 py-1.5 text-xs text-accent active:scale-[0.98] ${
          menu.open ? "border-accent/70" : "shadow-glow"
        }`}
        onClick={() => {
          if (menu.open) {
            menu.close();
          } else {
            show();
          }
        }}
      >
        <span className="font-mono text-2xs opacity-70">{String(current + 1)}</span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <Chevron open={menu.open} />
      </button>
      <Popover popover={menu} surface={surface} label={t("project.floors")}>
        <div className="sticky top-0 border-b border-line bg-raised p-2">
          <input
            ref={search}
            value={query}
            placeholder={t("project.search")}
            aria-label={t("project.search")}
            className="w-full rounded-lg border border-line bg-ink/60 px-2.5 py-1.5 text-xs text-text placeholder:text-faint focus:border-accent/60 focus:outline-none"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="p-1">
          {shown.length === 0 ? (
            <p className="px-2 py-3 text-center text-2xs text-faint">{t("project.noMatch")}</p>
          ) : (
            shown.map((floor, index) => (
              <Option
                key={floor.id}
                label={floor.name}
                hint={String(floors.indexOf(floor) + 1)}
                selected={floor.id === floorId}
                active={index === active}
                onHover={() => {
                  setActive(index);
                }}
                onPick={() => {
                  pick(index);
                }}
              />
            ))
          )}
        </div>
      </Popover>
    </>
  );
}
