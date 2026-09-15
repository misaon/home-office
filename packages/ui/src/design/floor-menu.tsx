import { useTranslation } from "react-i18next";
import { FloorRow } from "./floor-row.tsx";
import { useFloors } from "./live.ts";
import { useUi } from "../store.ts";
import { useDesign } from "./store.ts";

const PANEL =
  "fixed top-66 w-320 p-7 rounded-14 bg-pop border border-border-strong shadow-menu z-70 animate-drop-340";

const SEARCH = "flex items-center gap-8 py-9 px-10 rounded-9 bg-sunk border border-border mb-6";

const ADD =
  "w-full flex items-center gap-9 py-9 px-10 rounded-9 border-0 bg-transparent cursor-pointer text-left transition-[background] duration-180";

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
    <div className={`${PANEL} left-(--x)`} style={{ "--x": `${String(floorX)}px` }}>
      <div className={SEARCH}>
        <svg
          className="stroke-ink-meta"
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
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
          className="flex-1 min-w-0 border-0 bg-transparent text-12h py-1 px-2 placeholder:text-ink-ghost"
        />
      </div>
      <div className="flex flex-col gap-4 max-h-250 overflow-y-auto">
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
          <div className="py-12 px-10 text-12 text-ink-meta">No floor matches that.</div>
        ) : null}
      </div>
      <div className="h-1 bg-border my-6 mx-4" />
      <button
        type="button"
        onClick={() => {
          set({ floorOpen: false });
          setAddProjectOpen(true);
        }}
        className={`hover:bg-accent-a10 ${ADD}`}
      >
        <span className="w-22 h-22 flex-[0_0_22px] rounded-7 grid place-items-center bg-accent-a14">
          <svg
            className="stroke-accent"
            width="11"
            height="11"
            viewBox="0 0 12 12"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <line x1="6" y1="2" x2="6" y2="10" />
            <line x1="2" y1="6" x2="10" y2="6" />
          </svg>
        </span>
        <span className="text-12h text-accent-soft">{t("project.add")}</span>
      </button>
    </div>
  );
}
