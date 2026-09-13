import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const ZOOM_STEP = 1.15;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 8;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * One image, as large as the window allows. The wheel zooms around the pointer and dragging pans, the
 * same way the office map behaves, so the two read alike. Escape closes it, as it closes any dialog.
 */
export function ImageViewer({
  src,
  name,
  onClose,
}: {
  src: string;
  name: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={name}
      className="m-auto h-[90vh] max-h-none w-[90vw] max-w-none overflow-hidden rounded-xl border border-line bg-panel p-0 text-gray-100 shadow-2xl backdrop:bg-black/85"
      onClose={onClose}
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2 text-xs">
          <span className="truncate font-medium">{name}</span>
          <span className="font-mono text-2xs text-gray-400">{Math.round(view.scale * 100)} %</span>
          <span className="ml-auto flex items-center gap-3">
            <button
              type="button"
              className="text-gray-400 hover:text-white"
              onClick={() => {
                setView({ scale: 1, x: 0, y: 0 });
              }}
            >
              {t("chat.imageFit")}
            </button>
            <button
              type="button"
              className="text-gray-400 hover:text-white"
              onClick={() => {
                dialog.current?.close();
              }}
            >
              {t("common.close")}
            </button>
          </span>
        </header>
        <div
          className="min-h-0 flex-1 cursor-grab overflow-hidden bg-black/40"
          onWheel={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - box.left - box.width / 2;
            const py = e.clientY - box.top - box.height / 2;
            setView((v) => {
              const scale = clamp(
                v.scale * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
                ZOOM_MIN,
                ZOOM_MAX,
              );
              const factor = scale / v.scale;
              // The point under the pointer stays under the pointer, as the office camera does it.
              return { scale, x: px - (px - v.x) * factor, y: py - (py - v.y) * factor };
            });
          }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const from = drag.current;
            if (from === null) {
              return;
            }
            const dx = e.clientX - from.x;
            const dy = e.clientY - from.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <img
            src={src}
            alt={name}
            draggable={false}
            className="h-full w-full object-contain select-none"
            style={{
              transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})`,
            }}
          />
        </div>
      </div>
    </dialog>
  );
}
