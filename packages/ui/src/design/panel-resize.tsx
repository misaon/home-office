import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PANEL_WIDTH, useDesign } from "./store.ts";

const STAGE_MIN = 420;
const KEY_STEP = 24;

const HANDLE =
  "group absolute top-0 bottom-0 left-0 w-7 z-40 cursor-col-resize touch-none bg-transparent border-0 p-0";

const LINE =
  "absolute inset-y-0 left-2 w-2 rounded-pill transition-colors duration-200 group-hover:bg-accent-a45";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const widest = (): number => Math.min(PANEL_WIDTH.max, window.innerWidth - STAGE_MIN);

export function PanelResizer(): React.JSX.Element {
  const { t } = useTranslation();
  const width = useDesign((s) => s.panelWidth);
  const set = useDesign((s) => s.set);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number; frame: number } | null>(null);

  const release = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (drag.current === null) {
      return;
    }
    cancelAnimationFrame(drag.current.frame);
    drag.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <div
      /* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an hr can neither capture the pointer nor hold the drag line */
      role="separator"
      aria-orientation="vertical"
      aria-label={t("chat.resizePanel")}
      aria-valuenow={width}
      aria-valuemin={PANEL_WIDTH.min}
      aria-valuemax={PANEL_WIDTH.max}
      tabIndex={0}
      title={t("chat.resizeHint")}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, width, frame: 0 };
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start === null) {
          return;
        }
        const next = clamp(start.width + (start.x - event.clientX), PANEL_WIDTH.min, widest());
        cancelAnimationFrame(start.frame);
        start.frame = requestAnimationFrame(() => {
          set({ panelWidth: next });
        });
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onDoubleClick={() => {
        set({ panelWidth: PANEL_WIDTH.initial });
      }}
      onKeyDown={(event) => {
        const step =
          event.key === "ArrowLeft" ? KEY_STEP : event.key === "ArrowRight" ? -KEY_STEP : 0;
        if (step !== 0) {
          event.preventDefault();
          set({ panelWidth: clamp(width + step, PANEL_WIDTH.min, widest()) });
        }
      }}
      className={HANDLE}
    >
      <div className={`${LINE} ${dragging ? "bg-accent-a70" : "bg-transparent"}`} />
    </div>
  );
}
