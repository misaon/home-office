// The palette of the active tool: what can be painted, what it is called and how much room it takes.
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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
      {options.map((option) => {
        const footprint = size(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            style={{
              borderRadius: "9px",
              padding: "7px 9px",
              textAlign: "left",
              fontSize: "11px",
              lineHeight: "1.35",
              overflowWrap: "break-word",
              cursor: "pointer",
              transition: "all .2s",
              border: `1px solid ${option === value ? "rgba(255,197,49,.55)" : "#2C2C32"}`,
              background: option === value ? "rgba(255,197,49,.1)" : "#101013",
              color: option === value ? "#FFD666" : "#CFCCC6",
            }}
            onClick={() => {
              pick(option);
            }}
          >
            {name(option)}
            {footprint === null ? null : (
              <span
                style={{
                  display: "block",
                  marginTop: "3px",
                  fontFamily: "'JetBrains Mono',monospace",
                  color: "#A6A39C",
                }}
              >
                {footprint}
              </span>
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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <p style={{ fontSize: "11.5px", fontWeight: "500", color: "#CFCCC6", margin: "0" }}>
          {t(KIND_LABEL[tool])}
        </p>
        <span
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#A6A39C" }}
        >
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
        style={FIELD}
      />
      {options.length === 0 ? (
        <p style={{ fontSize: "11.5px", color: "#A6A39C" }}>
          {t("editor.noMatch", { needle: search.trim() })}
        </p>
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button
            onClick={() => {
              setBrush(rotate(brush));
            }}
          >
            {t("editor.rotate")}
          </Button>
          <span
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#CFCCC6" }}
          >
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
