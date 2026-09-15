import type { Message } from "./data.ts";
import { MONO } from "./tokens.ts";
import { useTranslation } from "react-i18next";
import { ChatThumb } from "./chat-thumb.tsx";

const META = `${MONO} text-10 tracking-mono`;
const BODY = "text-13h leading-text text-pretty";

const MINE =
  "max-w-[90%] ml-auto py-11 px-13 rounded-15 rounded-br-5 bg-[linear-gradient(160deg,var(--color-accent-a17),var(--color-accent-a08))] border border-accent-a30";

const THEIRS =
  "max-w-[92%] mr-auto py-11 px-13 rounded-15 rounded-bl-5 bg-toast border border-border";

/** One thing that was said: yours on the right in gold, theirs on the left in grey. */
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
