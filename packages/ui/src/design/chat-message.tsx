import { type Message } from "./data.ts";
import { CircleQuestionMark, FileText } from "lucide-react";
import { MONO } from "./tokens.ts";
import { useTranslation } from "react-i18next";
import { type Attachment, isImageType } from "@ho/protocol";
import { useAttachmentUrl } from "../attachments.ts";
import { useDesign } from "./store.ts";
import { RichText } from "./markdown.tsx";

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

const META = `${MONO} text-10 tracking-mono`;
const BODY = "text-13h leading-text text-pretty";

const MINE =
  "max-w-[90%] ml-auto py-11 px-13 rounded-15 rounded-br-5 bg-[linear-gradient(160deg,var(--color-accent-a17),var(--color-accent-a08))] border border-accent-a30";

const THEIRS =
  "max-w-[92%] mr-auto py-11 px-13 rounded-15 rounded-bl-5 bg-toast border border-border";

const ASKING =
  "max-w-[92%] mr-auto py-11 px-13 rounded-15 rounded-bl-5 bg-toast border border-warn";

const ASK_TAG = "flex items-center gap-6 mt-8 text-10h text-warn";

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
          <div className={`${BODY} text-ink-bright`}>
            <RichText text={message.text} />
          </div>
          <ChatThumbs attachments={message.attachments} />
        </div>
      ) : (
        <div className={message.asks === undefined ? THEIRS : ASKING}>
          <div className={`${META} text-ink-label mb-6`}>
            <span>{message.who ?? boss}</span> · <span>{message.time}</span>
          </div>
          <div className={`${BODY} text-ink-soft`}>
            <RichText text={message.text} />
          </div>
          <ChatThumbs attachments={message.attachments} />
          {message.asks === undefined ? null : (
            <div className={ASK_TAG}>
              <CircleQuestionMark size={11} strokeWidth={1.5} />
              <span>{t("chat.awaitingAnswer")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
