import { type Message } from "./data.ts";
import { MONO } from "./tokens.ts";
import { useTranslation } from "react-i18next";
import { type Attachment, isImageType } from "@ho/protocol";
import { useAttachmentUrl } from "../attachments.ts";
import { useDesign } from "./store.ts";

const FRAME =
  "block w-full mt-10 h-118 rounded-10 cursor-pointer overflow-hidden p-0 border border-accent-a30 bg-sunk transition-all duration-220";

function ChatThumb({ attachment }: { attachment: Attachment }): React.JSX.Element {
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

const META = `${MONO} text-10 tracking-mono`;
const BODY = "text-13h leading-text text-pretty";

const MINE =
  "max-w-[90%] ml-auto py-11 px-13 rounded-15 rounded-br-5 bg-[linear-gradient(160deg,var(--color-accent-a17),var(--color-accent-a08))] border border-accent-a30";

const THEIRS =
  "max-w-[92%] mr-auto py-11 px-13 rounded-15 rounded-bl-5 bg-toast border border-border";

export function ChatMessage({
  message,
  boss,
}: {
  message: Message;
  boss: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col animate-lift-450">
      {message.mine ? (
        <div className={MINE}>
          <div className={`${META} text-accent-quote mb-5`}>
            {t("chat.you")} · <span>{message.time}</span>
          </div>
          <div className={`${BODY} text-ink-bright`}>{message.text}</div>
          {message.attachment === undefined ? null : <ChatThumb attachment={message.attachment} />}
        </div>
      ) : (
        <div className={THEIRS}>
          <div className={`${META} text-ink-label mb-6`}>
            <span>{message.who ?? boss}</span> · <span>{message.time}</span>
          </div>
          <div className={`${BODY} text-ink-soft`}>{message.text}</div>
        </div>
      )}
    </div>
  );
}
