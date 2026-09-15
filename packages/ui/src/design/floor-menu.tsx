import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { FloorRow } from "./floor-row.tsx";
import { Plus } from "lucide-react";
import { useFloors } from "./live.ts";
import { useUi } from "../store.ts";
import { useDesign } from "./store.ts";

const PANEL =
  "w-320 p-7 rounded-14 bg-pop border border-border-strong shadow-menu origin-(--transform-origin) transition-[opacity,translate] duration-340 ease-out data-starting-style:opacity-0 data-starting-style:-translate-y-8 data-ending-style:opacity-0";

const SEARCH = "flex items-center gap-8 py-9 px-10 rounded-9 bg-sunk border border-border mb-6";

const ADD =
  "w-full flex items-center gap-9 py-9 px-10 rounded-9 border-0 bg-transparent cursor-pointer text-left transition-[background] duration-180";

/** Which floor the office is showing, with a search because a workshop can have many. */
export function FloorMenu({ onPicked }: { onPicked: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const floors = useFloors();
  const floorId = useUi((s) => s.floorId);
  const selectFloor = useUi((s) => s.selectFloor);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const floorQuery = useDesign((s) => s.floorQuery);
  const set = useDesign((s) => s.set);

  const needle = floorQuery.trim().toLowerCase();
  const rows = floors
    .map((floor, index) => ({ floor, index }))
    .filter(({ floor }) => floor.name.toLowerCase().includes(needle));

  return (
    <Popover.Portal>
      <Popover.Positioner className="z-70 outline-none" sideOffset={10} align="start">
        <Popover.Popup aria-label={t("project.floors")} className={PANEL}>
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
                  set({ sheet: null, query: "", searchOpen: false });
                  onPicked();
                }}
              />
            ))}
            {rows.length === 0 ? (
              <div className="py-12 px-10 text-12 text-ink-meta">{t("project.noMatch")}</div>
            ) : null}
          </div>
          <div className="h-1 bg-border my-6 mx-4" />
          <button
            type="button"
            onClick={() => {
              onPicked();
              setAddProjectOpen(true);
            }}
            className={`hover:bg-accent-a10 ${ADD}`}
          >
            <span className="w-22 h-22 flex-[0_0_22px] rounded-7 grid place-items-center bg-accent-a14">
              <Plus size={11} strokeWidth={1.6} className="stroke-accent" />
            </span>
            <span className="text-12h text-accent-soft">{t("project.add")}</span>
          </button>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}
