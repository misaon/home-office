import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useTranslation } from "react-i18next";
import { DISPLAY } from "./tokens.ts";

export type Ask = {
  title: string;
  body: string;
  okLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  act: () => void;
};

const SHEET =
  "w-[min(440px,100vw-64px)] rounded-18 bg-dialog border border-border-sheet shadow-sheet animate-pop-400";

const FOOT = "flex items-center justify-end gap-9 py-14 px-24 border-t border-line bg-foot";

const BACKDROP =
  "fixed inset-0 z-60 bg-scrim-a78 backdrop-blur-[12px] transition-opacity duration-240 data-starting-style:opacity-0 data-ending-style:opacity-0";

function AskMark({ danger }: { danger: boolean }): React.JSX.Element {
  return (
    <div
      className={`w-38 h-38 flex-[0_0_38px] rounded-12 grid place-items-center ${danger ? "bg-bad-a12" : "bg-accent-a14"} ${danger ? "text-bad-soft" : "text-accent-soft"}`}
    >
      {danger ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M10 3.2 2.6 16h14.8z" />
          <line x1="10" y1="8" x2="10" y2="11.6" />
          <circle cx="10" cy="13.8" r=".9" fill="currentColor" stroke="none" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <circle cx="10" cy="10" r="7.2" />
          <line x1="10" y1="6.4" x2="10" y2="10.4" />
          <circle cx="10" cy="13.4" r=".9" fill="currentColor" stroke="none" />
        </svg>
      )}
    </div>
  );
}

function AskFoot({
  ask,
  danger,
  onClose,
}: {
  ask: Ask | null;
  danger: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={FOOT}>
      <button
        type="button"
        onClick={onClose}
        className="hover:text-ink hover:border-border-hover hover:bg-raised py-10 px-16 rounded-11 border border-border-strong bg-transparent text-12h text-ink-quiet cursor-pointer transition-all duration-200"
      >
        {ask?.cancelLabel ?? t("confirm.keep")}
      </button>
      <button
        type="button"
        onClick={() => {
          ask?.act();
          onClose();
        }}
        className={`hover:-translate-y-2 hover:shadow-lift-dark-lg py-10 px-18 rounded-11 border-0 cursor-pointer text-12h font-semibold transition-all duration-220 ${danger ? "bg-bad-a18" : "bg-accent"} ${danger ? "text-bad-pale" : "text-accent-ink"}`}
      >
        {ask?.okLabel ?? t("common.remove")}
      </button>
    </div>
  );
}

export function Confirm({
  ask,
  onClose,
}: {
  ask: Ask | null;
  onClose: () => void;
}): React.JSX.Element {
  const danger = ask?.danger !== false;

  return (
    <AlertDialog.Root
      open={ask !== null}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={BACKDROP} />
        <AlertDialog.Viewport className="fixed inset-0 z-60 flex items-center justify-center p-32">
          <AlertDialog.Popup className={`max-w-full outline-none ${SHEET}`}>
            <div className="flex gap-14 pt-22 px-24 pb-18">
              <AskMark danger={danger} />
              <div className="flex-1 min-w-0">
                <AlertDialog.Title
                  className={`${DISPLAY} font-bold text-17 tracking-tight leading-heading text-pretty`}
                >
                  {ask?.title ?? ""}
                </AlertDialog.Title>
                <AlertDialog.Description className="text-12h text-ink-label mt-8 leading-prose text-pretty">
                  {ask?.body ?? ""}
                </AlertDialog.Description>
              </div>
            </div>
            <AskFoot ask={ask} danger={danger} onClose={onClose} />
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
