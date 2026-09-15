import { isImageType, type Attachment } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { useAttachmentUrl } from "../attachments.ts";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const FRAME =
  "block w-full mt-10 h-118 rounded-10 cursor-pointer overflow-hidden p-0 border border-accent-a30 bg-sunk transition-all duration-220";

/** A file hanging on a message: the picture itself when it is one, its name when it is not. */
export function ChatThumb({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const image = isImageType(attachment.mime);
  const url = useAttachmentUrl(attachment, image);

  return (
    <button
      type="button"
      title={attachment.name}
      onClick={() => {
        set({ lightbox: attachment });
      }}
      className={`hover:border-accent-a70 hover:scale-101 ${FRAME}`}
    >
      {url === null ? (
        <span className={`${MONO} text-10 text-accent-quote`}>
          {image ? t("common.checking") : `${attachment.name} · ${t("chat.imageOpen")}`}
        </span>
      ) : (
        <img src={url} alt={attachment.name} className="w-full h-full object-cover block" />
      )}
    </button>
  );
}
