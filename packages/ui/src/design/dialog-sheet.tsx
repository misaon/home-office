import { Dialog } from "@base-ui/react/dialog";

/**
 * The shape the office's dialogs arrive in. Base UI brings the focus trap, Escape, the scrim and the
 * dismiss-on-outside-press; what stays here is the room the sheet stands in and the sheet itself, with
 * a lit header, a body and a footer that says what will happen.
 */

/**
 * The room around the sheet. A native `<dialog>` used to put this in the browser's top layer, where no
 * z-index could reach it; Base UI portals to the body instead, so the office's own scale applies and
 * the room has to be told it stands above the header, which is `z-40`.
 */
const CENTRE = "fixed inset-0 z-60 flex items-center justify-center p-32";

/** What the office is seen through while a dialog is up. */
export const BACKDROP =
  "fixed inset-0 z-60 bg-scrim-a74 backdrop-blur-[10px] transition-opacity duration-280 data-starting-style:opacity-0 data-ending-style:opacity-0";

/**
 * A modal and the room inside it. `open` drives Base UI's own state, Escape and a press in the room
 * both call `onClose`, and whatever is handed in stands in the middle of the room.
 */
export function Modal({
  open,
  label,
  backdrop = BACKDROP,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  /** Only Confirm dims further than the rest; everything else takes the office's own scrim. */
  backdrop?: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={backdrop} />
        <Dialog.Viewport className={CENTRE}>
          <Dialog.Popup aria-label={label} className="max-w-full max-h-full outline-none">
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

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
  return (
    <Modal open={open} label={label} onClose={onClose}>
      <div
        className="w-(--sheet) max-h-[calc(100vh-64px)] overflow-y-auto rounded-20 bg-dialog border border-border-sheet shadow-dialog animate-pop-440"
        style={{ "--sheet": width }}
      >
        <div className="relative pt-24 px-26 pb-20 overflow-hidden">
          <div className={GLOW} />
          <div className="relative flex items-start gap-14">{head}</div>
        </div>
        <div className="pt-0 px-26 pb-22">{children}</div>
        <div className={FOOT}>{footer}</div>
      </div>
    </Modal>
  );
}
