import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { FloorMenu } from "./floor-menu.tsx";
import { MONO } from "./tokens.ts";
import { useFloor, useFloors } from "./live.ts";
import { useDesign } from "./store.ts";

/** Which floor you are on, and the door to all the others. */
export function HeaderFloor(): React.JSX.Element | null {
  const { t } = useTranslation();
  const floors = useFloors();
  const floor = useFloor();
  const floorOpen = useDesign((s) => s.floorOpen);
  const update = useDesign((s) => s.update);
  const button = useRef<HTMLButtonElement>(null);
  if (floor === null) {
    return null;
  }
  const index = floors.findIndex((f) => f.id === floor.id);

  return (
    <div className="relative flex-[0_1_auto] min-w-0">
      <button
        type="button"
        ref={button}
        title={floor.name}
        aria-label={t("project.floors")}
        onClick={() => {
          const left =
            button.current === null ? 18 : Math.round(button.current.getBoundingClientRect().left);
          update((s) => ({ floorOpen: !s.floorOpen, floorQuery: "", floorX: left }));
        }}
        className="hover:border-accent-a50 hover:bg-chip-hover hover:-translate-y-1 flex items-center gap-9 pt-7 pr-11 pb-7 pl-7 rounded-11 border border-border-strong bg-pop-alt cursor-pointer min-w-0 max-w-full overflow-hidden transition-all duration-220 ease-soft"
      >
        <span
          className={`flex-[0_0_auto] w-19 h-19 grid place-items-center rounded-6 bg-accent text-accent-ink-badge ${MONO} text-10h font-medium`}
        >
          <span>{index + 1}</span>
        </span>
        <span
          className={`flex-[1_1_auto] min-w-0 ${MONO} text-12 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis text-left`}
        >
          {floor.name}
        </span>
        <svg
          className="flex-[0_0_auto] stroke-ink-meta"
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <polyline points="3,4.6 6,1.8 9,4.6" />
          <polyline points="3,7.4 6,10.2 9,7.4" />
        </svg>
      </button>
      {floorOpen ? <FloorMenu /> : null}
    </div>
  );
}
