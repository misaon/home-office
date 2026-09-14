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
    <div style={{ position: "relative", flex: "0 1 auto", minWidth: "0" }}>
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: "9px",
          padding: "7px 11px 7px 7px",
          borderRadius: "11px",
          border: "1px solid #2C2C32",
          background: "#131316",
          cursor: "pointer",
          minWidth: "0",
          maxWidth: "100%",
          overflow: "hidden",
          transition: "all .22s cubic-bezier(.2,.8,.3,1)",
        }}
        className="hop0"
      >
        <span
          style={{
            flex: "0 0 auto",
            width: "19px",
            height: "19px",
            display: "grid",
            placeItems: "center",
            borderRadius: "6px",
            background: "var(--a,#FFC531)",
            color: "#141006",
            ...MONO,
            fontSize: "10.5px",
            fontWeight: "500",
          }}
        >
          <span>{index + 1}</span>
        </span>
        <span
          style={{
            flex: "1 1 auto",
            minWidth: "0",
            ...MONO,
            fontSize: "12px",
            letterSpacing: "-.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textAlign: "left",
          }}
        >
          {floor.name}
        </span>
        <svg
          style={{ flex: "0 0 auto" }}
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="#A6A39C"
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
