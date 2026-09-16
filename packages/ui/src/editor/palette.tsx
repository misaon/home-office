import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { DoorKind, OBJECT_SPEC, ObjectKind, RoomKind, WallMaterial } from "@ho/protocol";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useKindName } from "../i18n/kinds.ts";
import { Button, FIELD } from "../design/controls.tsx";
import { type Brush, rotate, type Tool } from "./draft.ts";

const KIND_LABEL = {
  wall: "editor.material",
  room: "editor.room",
  door: "editor.door",
  object: "editor.furniture",
} as const satisfies Record<Tool, string>;

const SCHEMA = {
  wall: WallMaterial,
  room: RoomKind,
  door: DoorKind,
  object: ObjectKind,
} as const;

function Choices({
  label,
  options,
  value,
  size,
  name,
  pick,
}: {
  label: string;
  options: readonly string[];
  value: string;
  size: (option: string) => string | null;
  name: (option: string) => string;
  pick: (option: string) => void;
}): React.JSX.Element {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const picked = options.find((option) => option === next.at(-1));
        if (picked !== undefined) {
          pick(picked);
        }
      }}
      className="grid grid-cols-2 gap-6"
    >
      {options.map((option) => {
        const footprint = size(option);
        return (
          <Toggle
            key={option}
            value={option}
            className={`rounded-9 py-7 px-9 text-left text-11 leading-snug break-words cursor-pointer transition-all duration-200 border ${option === value ? "border-accent-a55" : "border-border-strong"} ${option === value ? "bg-accent-a10" : "bg-card"} ${option === value ? "text-accent-soft" : "text-ink-quiet"}`}
          >
            {name(option)}
            {footprint === null ? null : (
              <span className="block mt-3 font-mono text-ink-meta">{footprint}</span>
            )}
          </Toggle>
        );
      })}
    </ToggleGroup>
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
  const options =
    needle === ""
      ? all
      : all.filter(
          (option) => option.includes(needle) || name(option).toLowerCase().includes(needle),
        );
  const spec = OBJECT_SPEC[brush.object];
  return (
    <>
      <div className="flex items-baseline justify-between gap-12">
        <p className="text-11h font-medium text-ink-quiet m-0">{t(KIND_LABEL[tool])}</p>
        <span className="font-mono text-11 text-ink-meta">
          {options.length === all.length
            ? all.length
            : t("common.ofTotal", { shown: options.length, total: all.length })}
        </span>
      </div>
      <input
        aria-label={t("editor.searchIn", { what: t(KIND_LABEL[tool]) })}
        placeholder={t("common.search")}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        className={`${FIELD} placeholder:text-ink-ghost`}
      />
      {options.length === 0 ? (
        <p className="text-11h text-ink-meta my-11h">
          {t("editor.noMatch", { needle: search.trim() })}
        </p>
      ) : null}
      <Choices
        label={t("editor.palette")}
        options={options}
        value={brush[tool]}
        size={tool === "object" ? (option) => footprintOf(option, t) : () => null}
        name={name}
        pick={(option) => {
          setBrush({ ...brush, [tool]: SCHEMA[tool].parse(option) });
        }}
      />
      {tool === "object" || tool === "door" ? (
        <div className="flex items-center gap-12">
          <Button
            onClick={() => {
              setBrush(rotate(brush));
            }}
          >
            {t("editor.rotate")}
          </Button>
          <span className="font-mono text-11 text-ink-quiet">
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
