import { type RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EXIT_MS } from "./motion.ts";

/** The gap between the control and the surface it opens, and how far either stays off a window edge. */
const GAP = 6;
const EDGE = 12;
const MAX_HEIGHT = 320;
/** With less room than this underneath, the surface would rather open upwards. */
const MIN_BELOW = 180;

type Box = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };
type Phase = "closed" | "open" | "closing";

type Options = {
  /** As wide as the control, or a fixed width for a surface that holds more than the control does. */
  width?: "anchor" | number;
  /** Which edge the surface lines up with when it is not as wide as the control. */
  align?: "start" | "end";
};

const place = (anchor: DOMRect, width: Options["width"], align: Options["align"]): Box => {
  const w = width === "anchor" || width === undefined ? anchor.width : width;
  const below = window.innerHeight - anchor.bottom - EDGE;
  const above = anchor.top - EDGE;
  const drop = below >= MIN_BELOW || below >= above;
  const wanted = align === "end" ? anchor.right - w : anchor.left;
  return {
    width: w,
    left: Math.max(EDGE, Math.min(wanted, window.innerWidth - w - EDGE)),
    maxHeight: Math.min(MAX_HEIGHT, Math.max(below, above)),
    ...(drop ? { top: anchor.bottom + GAP } : { bottom: window.innerHeight - anchor.top + GAP }),
  };
};

export type Popover = {
  open: boolean;
  phase: Phase;
  box: Box | null;
  start: () => void;
  close: () => void;
  toggle: () => void;
};

/**
 * Whether a surface anchored to a control is on screen, and where. It leaves on a clock rather than on a
 * transition event, so a dropped frame cannot strand it, and anything that moves the control closes it,
 * because a surface placed once cannot follow. Only a press outside both the control and the surface
 * closes it, so what the surface holds can be clicked, typed into and scrolled.
 */
export function usePopover(
  anchor: RefObject<HTMLElement | null>,
  surface: RefObject<HTMLElement | null>,
  options: Options = {},
): Popover {
  const [phase, setPhase] = useState<Phase>("closed");
  const [box, setBox] = useState<Box | null>(null);
  const open = phase === "open";
  const width = options.width ?? "anchor";
  const align = options.align ?? "start";

  const close = (): void => {
    setPhase((now) => (now === "open" ? "closing" : now));
  };
  const start = (): void => {
    const rect = anchor.current?.getBoundingClientRect();
    if (rect !== undefined) {
      setBox(place(rect, width, align));
      setPhase("open");
    }
  };

  useEffect(() => {
    const timer =
      phase === "closing"
        ? setTimeout(() => {
            setPhase("closed");
          }, EXIT_MS)
        : null;
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [phase]);

  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      const target = event.target;
      const inside =
        target instanceof Node &&
        (anchor.current?.contains(target) === true || surface.current?.contains(target) === true);
      if (!inside) {
        close();
      }
    };
    if (open) {
      document.addEventListener("pointerdown", outside);
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    }
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, anchor, surface]);

  return {
    open,
    phase,
    box,
    start,
    close,
    toggle: () => {
      if (open) {
        close();
      } else {
        start();
      }
    },
  };
}

/**
 * The surface itself, in the document's own corner so no panel's overflow can cut it off. It exists only
 * while it has somewhere to be, and it arrives and leaves with the office's own pop.
 */
export function Popover({
  popover,
  surface,
  label,
  className = "",
  children,
}: {
  popover: Popover;
  surface: RefObject<HTMLDivElement | null>;
  label?: string;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  if (popover.phase === "closed" || popover.box === null) {
    return null;
  }
  return createPortal(
    <div
      ref={surface}
      aria-label={label}
      style={popover.box}
      className={`animate-pop fixed z-50 overflow-y-auto overscroll-contain rounded-xl border border-line-strong bg-raised shadow-lift ring-1 ring-white/[0.04] ring-inset ${
        popover.phase === "closing" ? "[animation-direction:reverse]" : ""
      } ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
