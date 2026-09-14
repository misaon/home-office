import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const ZOOM_STEP = 1.15;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 8;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };

/** The point under the pointer stays under the pointer, the way the office camera does it. */
const zoomed = (view: View, factor: number, px: number, py: number): View => {
  const scale = clamp(view.scale * factor, ZOOM_MIN, ZOOM_MAX);
  const step = scale / view.scale;
  return { scale, x: px - (px - view.x) * step, y: py - (py - view.y) * step };
};

/** A square button for the toolbar's two zoom steps, which are glyphs rather than words. */
function Step({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Toolbar({
  name,
  scale,
  onZoom,
  onFit,
  onClose,
}: {
  name: string;
  scale: number;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
      <span className="truncate text-xs font-medium">{name}</span>
      <Badge>{`${String(Math.round(scale * 100))} %`}</Badge>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <Step
          label={t("chat.imageZoomOut")}
          onClick={() => {
            onZoom(1 / ZOOM_STEP);
          }}
        >
          −
        </Step>
        <Step
          label={t("chat.imageZoomIn")}
          onClick={() => {
            onZoom(ZOOM_STEP);
          }}
        >
          +
        </Step>
        <Button type="button" variant="outline" size="xs" onClick={onFit}>
          {t("chat.imageFit")}
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onClose}>
          {t("common.close")}
        </Button>
      </span>
    </header>
  );
}

/** The image and the two gestures that move it: the wheel zooms, a drag pans, a double click resets. */
function Stage({
  src,
  name,
  view,
  setView,
}: {
  src: string;
  name: string;
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
}): React.JSX.Element {
  const from = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const release = (): void => {
    from.current = null;
    setDragging(false);
  };
  return (
    <div
      className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onWheel={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        setView((v) =>
          zoomed(
            v,
            e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
            e.clientX - box.left - box.width / 2,
            e.clientY - box.top - box.height / 2,
          ),
        );
      }}
      onDoubleClick={() => {
        setView(FIT);
      }}
      onPointerDown={(e) => {
        from.current = { x: e.clientX, y: e.clientY };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const last = from.current;
        if (last === null) {
          return;
        }
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        from.current = { x: e.clientX, y: e.clientY };
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <img
        src={src}
        alt={name}
        draggable={false}
        className={`max-h-full max-w-full object-contain select-none ${
          dragging
            ? ""
            : "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-soft)]"
        }`}
        style={{
          transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})`,
        }}
      />
    </div>
  );
}

/**
 * One image, as large as the window allows, in the same dialog the rest of the office uses: it arrives
 * and leaves with the transition in `styles.css`, and Escape closes it as it closes any dialog.
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
  const [view, setView] = useState<View>(FIT);
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[90vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{name}</DialogTitle>
        <Toolbar
          name={name}
          scale={view.scale}
          onZoom={(factor) => {
            setView((v) => zoomed(v, factor, 0, 0));
          }}
          onFit={() => {
            setView(FIT);
          }}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        />
        <Stage src={src} name={name} view={view} setView={setView} />
      </DialogContent>
    </Dialog>
  );
}
