// The palette of the active tool: what can be painted, what it is called and how much room it takes.
import { DoorKind, OBJECT_SPEC, ObjectKind, RoomKind, WallMaterial } from "@ho/protocol";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useKindName } from "../i18n/kinds.ts";
import { Button, CONTROL } from "../kit/controls.tsx";
import { type Brush, rotate, type Tool } from "./draft.ts";

const KIND_LABEL = {
  wall: "editor.material",
  room: "editor.room",
  door: "editor.door",
  object: "editor.furniture",
} as const satisfies Record<Tool, string>;

/** What each tool paints from: the closed list of the protocol, whose slugs the office file stores. */
const SCHEMA = {
  wall: WallMaterial,
  room: RoomKind,
  door: DoorKind,
  object: ObjectKind,
} as const;

/** Every choice of the active tool, two to a row, with a footprint where a piece has one. */
function Choices({
  options,
  value,
  size,
  name,
  pick,
}: {
  options: readonly string[];
  value: string;
  size: (option: string) => string | null;
  name: (option: string) => string;
  pick: (option: string) => void;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((option) => {
        const footprint = size(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            className={`rounded-lg border px-2 py-1.5 text-left text-2xs leading-tight break-words ${
              option === value
                ? "border-accent/60 bg-accent/10 text-text"
                : "border-line text-muted hover:border-line-strong hover:text-text"
            }`}
            onClick={() => {
              pick(option);
            }}
          >
            {name(option)}
            {footprint === null ? null : (
              <span className="mt-0.5 block font-mono text-faint">{footprint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const footprintOf = (option: string, t: TFunction): string | null => {
  const parsed = ObjectKind.safeParse(option);
  if (!parsed.success) {
    return null;
  }
  const spec = OBJECT_SPEC[parsed.data];
  const size = { w: spec.w, h: spec.h };
  return spec.onWall ? t("editor.footprintWall", size) : t("editor.footprint", size);
};

/** The palette of the active tool, plus the footprint of what is in hand. */
export function Palette({
  brush,
  setBrush,
  tool,
}: {
  brush: Brush;
  setBrush: (brush: Brush) => void;
  tool: Tool;
}): React.JSX.Element {
  const { t } = useTranslation();
  const kindName = useKindName();
  const [search, setSearch] = useState("");
  const sideways = brush.facing === "e" || brush.facing === "w";
  const all: readonly string[] = SCHEMA[tool].options;
  const needle = search.trim().toLowerCase();
  const name = (option: string): string => kindName(tool, option);
  // The slug is what a saved office contains, so searching keeps matching it as well as the name.
  const options =
    needle === ""
      ? all
      : all.filter(
          (option) => option.includes(needle) || name(option).toLowerCase().includes(needle),
        );
  const spec = OBJECT_SPEC[brush.object];
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xs font-medium text-muted">{t(KIND_LABEL[tool])}</p>
        <span className="font-mono text-2xs text-faint">
          {options.length === all.length
            ? all.length
            : t("common.ofTotal", { shown: options.length, total: all.length })}
        </span>
      </div>
      <input
        aria-label={t("editor.searchIn", { what: t(KIND_LABEL[tool]) })}
        className={`${CONTROL} py-1.5 text-xs`}
        placeholder={t("common.search")}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
      />
      {options.length === 0 ? (
        <p className="text-2xs text-faint">{t("editor.noMatch", { needle: search.trim() })}</p>
      ) : null}
      <Choices
        options={options}
        value={brush[tool]}
        size={tool === "object" ? (option) => footprintOf(option, t) : () => null}
        name={name}
        pick={(option) => {
          setBrush({ ...brush, [tool]: SCHEMA[tool].parse(option) });
        }}
      />
      {tool === "object" || tool === "door" ? (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setBrush(rotate(brush));
            }}
          >
            {t("editor.rotate")}
          </Button>
          <span className="font-mono text-2xs text-muted">
            {t("editor.facing", { facing: brush.facing })}
            {tool === "door"
              ? ""
              : `${t("editor.held", {
                  w: sideways ? spec.h : spec.w,
                  h: sideways ? spec.w : spec.h,
                })}${spec.onWall ? t("editor.onWall") : ""}`}
          </span>
        </div>
      ) : null}
    </>
  );
}
