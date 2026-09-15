import { useEffect, useRef } from "react";

/**
 * The shape both of the office's big dialogs arrive in: a sheet that pops in over a blurred office,
 * a lit header, a body, and a footer that says what will happen. A real `<dialog>`, so the platform
 * brings the focus trap, Escape and the backdrop.
 */

/** The room around the sheet. A `<dialog>` this size covers the viewport, so its own `::backdrop` is
 *  never what the pointer lands on: this element is, and a click that stops here is a click outside. */
export const CENTRE = "h-full flex items-center justify-center p-32";

/** Closes when the click landed on the room and not on the sheet standing in it. */
export const outside =
  (close: () => void) =>
  (event: React.MouseEvent<HTMLElement>): void => {
    if (event.target === event.currentTarget) {
      close();
    }
  };

const GLOW =
  "absolute -top-90 -left-40 w-280 h-280 rounded-half bg-[radial-gradient(circle,var(--color-accent-a12),transparent_68%)] pointer-events-none";

const FOOT = "flex items-center gap-9 py-16 px-26 border-t border-line bg-foot";

/** The hint the footer carries on the left, which grows to push the buttons right. */
export const HINT =
  "flex-1 min-w-0 text-11h text-ink-meta overflow-hidden text-ellipsis whitespace-nowrap";

export const CANCEL =
  "py-10 px-16 rounded-11 border border-border-strong bg-transparent text-12h text-ink-quiet cursor-pointer flex-[0_0_auto] transition-all duration-200";

export const COMMIT =
  "py-10 px-18 rounded-11 border-0 cursor-pointer text-12h font-semibold flex-[0_0_auto] transition-all duration-220";

/** The label above a field, and the caption above a group of them. */
export const CAP = "font-mono tracking-caps-wider uppercase text-ink-label";

export const INPUT = "w-full py-12 px-13 rounded-12 border border-border-strong bg-card text-12h";

export function DialogSheet({
  open,
  width,
  label,
  head,
  footer,
  onClose,
  children,
}: {
  open: boolean;
  width: string;
  label: string;
  head: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open) {
      element?.showModal();
      // showModal() hands focus to the first focusable thing, which is the scrolling sheet: a scroll
      // container Chrome rings in blue. The dialog itself takes it instead, and wears no ring.
      element?.focus();
    } else {
      element?.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="border-0 p-0 m-0 max-w-none max-h-none w-full h-full bg-transparent text-inherit overflow-hidden outline-none focus:outline-none focus-visible:outline-none backdrop:bg-scrim-a74 backdrop:backdrop-blur-[10px] backdrop:animate-fade-280"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div role="presentation" className={CENTRE} onClick={outside(onClose)}>
        <div
          className="w-(--sheet) max-h-full overflow-y-auto rounded-20 bg-dialog border border-border-sheet shadow-dialog animate-pop-440"
          style={{ "--sheet": width }}
        >
          <div className="relative pt-24 px-26 pb-20 overflow-hidden">
            <div className={GLOW} />
            <div className="relative flex items-start gap-14">{head}</div>
          </div>
          <div className="pt-0 px-26 pb-22">{children}</div>
          <div className={FOOT}>{footer}</div>
        </div>
      </div>
    </dialog>
  );
}
