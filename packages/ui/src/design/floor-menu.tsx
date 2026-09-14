import { useTranslation } from "react-i18next";
import { FloorRow } from "./floor-row.tsx";
import { useFloors } from "./live.ts";
import { useUi } from "../store.ts";
import { useDesign } from "./store.ts";

const PANEL: React.CSSProperties = {
  position: "fixed",
  top: "66px",
  width: "320px",
  padding: "7px",
  borderRadius: "14px",
  background: "#131317",
  border: "1px solid #2C2C32",
  boxShadow: "0 26px 60px rgba(0,0,0,.72)",
  zIndex: 70,
  animation: "dropIn .34s cubic-bezier(.2,.9,.3,1.1) both",
};

const SEARCH: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "9px 10px",
  borderRadius: "9px",
  background: "#0C0C0E",
  border: "1px solid #26262C",
  marginBottom: "6px",
};

const ADD: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "9px 10px",
  borderRadius: "9px",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  transition: "background .18s",
};

/** Which floor the office is showing, with a search because a workshop can have many. */
export function FloorMenu(): React.JSX.Element {
  const { t } = useTranslation();
  const floors = useFloors();
  const floorId = useUi((s) => s.floorId);
  const selectFloor = useUi((s) => s.selectFloor);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const floorQuery = useDesign((s) => s.floorQuery);
  const floorX = useDesign((s) => s.floorX);
  const set = useDesign((s) => s.set);

  const needle = floorQuery.trim().toLowerCase();
  const rows = floors
    .map((floor, index) => ({ floor, index }))
    .filter(({ floor }) => floor.name.toLowerCase().includes(needle));

  return (
    <div style={{ ...PANEL, left: `${String(floorX)}px` }}>
      <div style={SEARCH}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          stroke="#A6A39C"
          strokeWidth="1.5"
        >
          <circle cx="6" cy="6" r="4.2" />
          <line x1="9.2" y1="9.2" x2="12.4" y2="12.4" strokeLinecap="round" />
        </svg>
        <input
          value={floorQuery}
          onChange={(e) => {
            set({ floorQuery: e.target.value });
          }}
          placeholder={t("project.search")}
          style={{
            flex: "1",
            minWidth: "0",
            border: "0",
            background: "transparent",
            fontSize: "12.5px",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          maxHeight: "250px",
          overflowY: "auto",
        }}
      >
        {rows.map(({ floor, index }) => (
          <FloorRow
            key={floor.name}
            floor={floor}
            index={index}
            current={floor.id === floorId}
            onPick={() => {
              selectFloor(floor.id);
              set({ floorOpen: false, sheet: null, query: "", searchOpen: false });
            }}
          />
        ))}
        {rows.length === 0 ? (
          <div style={{ padding: "12px 10px", fontSize: "12px", color: "#A6A39C" }}>
            No floor matches that.
          </div>
        ) : null}
      </div>
      <div style={{ height: "1px", background: "#26262C", margin: "6px 4px" }} />
      <button
        type="button"
        onClick={() => {
          set({ floorOpen: false });
          setAddProjectOpen(true);
        }}
        style={ADD}
        className="ho-0822da"
      >
        <span
          style={{
            width: "22px",
            height: "22px",
            flex: "0 0 22px",
            borderRadius: "7px",
            display: "grid",
            placeItems: "center",
            background: "rgba(255,197,49,.14)",
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            stroke="#FFC531"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <line x1="6" y1="2" x2="6" y2="10" />
            <line x1="2" y1="6" x2="10" y2="6" />
          </svg>
        </span>
        <span style={{ fontSize: "12.5px", color: "#FFD666" }}>{t("project.add")}</span>
      </button>
    </div>
  );
}
