import { type Attachment, isImageType } from "@ho/protocol";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAttachmentUrl } from "../attachments.ts";
import { useDesign } from "./store.ts";
import { MONO } from "./tokens.ts";

const FRAME =
  "block w-full mt-10 h-118 rounded-10 cursor-pointer overflow-hidden p-0 border border-accent-a30 bg-sunk transition-all duration-220";

const FILE =
  "flex items-center gap-8 w-full mt-10 py-8 px-10 rounded-10 cursor-pointer border border-accent-a30 bg-sunk text-left transition-all duration-220";

function ChatThumb({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const image = isImageType(attachment.mime);
  const url = useAttachmentUrl(attachment, image);

  if (!image) {
    return (
      <button
        type="button"
        title={attachment.name}
        onClick={() => {
          set({ lightbox: attachment });
        }}
        className={`hover:border-accent-a70 ${FILE}`}
      >
        <FileText size={13} strokeWidth={1.4} className="flex-[0_0_auto] text-accent-quote" />
        <span
          className={`flex-1 min-w-0 ${MONO} text-10h text-accent-quote overflow-hidden text-ellipsis whitespace-nowrap`}
        >
          {attachment.name}
        </span>
        <span className={`${MONO} text-9h text-ink-label flex-[0_0_auto]`}>{t("chat.open")}</span>
      </button>
    );
  }
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
        <span className={`${MONO} text-10 text-accent-quote`}>{t("common.checking")}</span>
      ) : (
        <img src={url} alt={attachment.name} className="w-full h-full object-cover block" />
      )}
    </button>
  );
}

export function ChatThumbs({
  attachments,
}: {
  attachments: readonly Attachment[];
}): React.JSX.Element | null {
  const [only] = attachments;
  if (only === undefined) {
    return null;
  }
  if (attachments.length === 1) {
    return <ChatThumb attachment={only} />;
  }
  return (
    <div className="grid grid-cols-2 gap-8 mt-10 [&>*]:mt-0">
      {attachments.map((attachment) => (
        <ChatThumb key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}
