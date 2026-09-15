import { Dialog } from "@base-ui/react/dialog";
import { isImageType, type Attachment } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { useAttachmentUrl } from "../attachments.ts";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

/** The strip under the picture: what the file is, and the way out. */
function LightboxBar({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex-[0_0_auto] flex items-center gap-10 py-13 px-16 bg-card-lit border-t border-border">
      <span
        className={`flex-1 min-w-0 ${MONO} text-11h text-ink-quiet overflow-hidden text-ellipsis whitespace-nowrap`}
      >
        {`${attachment.name} · ${(attachment.bytes / 1024).toFixed(0)} kB`}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="py-8 px-13 rounded-9 border-0 bg-accent text-accent-ink text-12 font-semibold cursor-pointer whitespace-nowrap"
      >
        {t("common.close")}
      </button>
    </div>
  );
}

/** An attachment at full size, over everything, closed by clicking anywhere. */
export function Lightbox({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const url = useAttachmentUrl(attachment);
  const close = (): void => {
    set({ lightbox: null });
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-85 bg-scrim-a86 backdrop-blur-[14px] transition-opacity duration-260 data-starting-style:opacity-0 data-ending-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-85 flex flex-col items-center justify-center gap-14 p-24">
          <Dialog.Popup
            aria-label={attachment.name}
            className="w-[min(1240px,97vw)] flex-[1_1_auto] min-h-0 flex flex-col rounded-18 overflow-hidden border border-accent-a30 shadow-sheet outline-none animate-pop-420"
          >
            <div className="flex-1 min-h-0 bg-sunk grid place-items-center overflow-hidden">
              {!isImageType(attachment.mime) ? (
                <span className={`${MONO} text-13 text-accent-quote`}>{attachment.name}</span>
              ) : url === null ? (
                <span className={`${MONO} text-13 text-accent-quote`}>{t("common.checking")}</span>
              ) : (
                <img
                  src={url}
                  alt={attachment.name}
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
            <LightboxBar attachment={attachment} onClose={close} />
          </Dialog.Popup>
          <span className="text-11h text-ink-meta flex-[0_0_auto]">{t("chat.clickToClose")}</span>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
