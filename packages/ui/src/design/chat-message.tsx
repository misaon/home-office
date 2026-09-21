import { CircleQuestionMark } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ROLE_KEY } from "../i18n/labels.ts";
import { Avatar } from "./avatar.tsx";
import { CopyButton } from "./chat-copy.tsx";
import { ChatThumbs } from "./chat-thumbs.tsx";
import type { Message } from "./data.ts";
import { RichText } from "./markdown.tsx";
import { DISPLAY, MONO } from "./tokens.ts";

const SHELL = "group relative flex flex-col animate-lift-450";

const HEAD = "flex items-center gap-7 mb-6 px-2";

const NAME = `${DISPLAY} font-semibold text-12h text-ink-pale`;

const ROLE = `${MONO} text-9h h-16 px-6 rounded-pill bg-edge-lit text-ink-faint flex items-center leading-none`;

const TIME = `${MONO} text-10 tracking-mono text-ink-idle`;

const BODY = "text-13h leading-text text-pretty";

const BUBBLE =
  "relative py-11 px-14 rounded-16 border shadow-[inset_0_1px_0_var(--color-glint-a05)]";

const MINE = `${BUBBLE} max-w-[88%] ml-auto rounded-br-6 border-accent-a30 bg-[linear-gradient(160deg,var(--color-accent-a17),var(--color-accent-a08))]`;

const THEIRS = `${BUBBLE} max-w-[92%] mr-auto rounded-bl-6`;

const PLAIN = `${THEIRS} border-border bg-[linear-gradient(180deg,var(--color-raised),var(--color-toast))]`;

const ASKING = `${THEIRS} border-warn bg-[linear-gradient(180deg,var(--color-raised),var(--color-toast))]`;

const TROUBLE = `${THEIRS} border-bad-a45 bg-bad-a12`;

const ASK_TAG = "flex items-center gap-6 mt-8 text-10h text-warn";

const COPY = "absolute top-7 right-7";

const bubbleOf = (message: Message): string =>
  message.asks === undefined ? (message.tone === "trouble" ? TROUBLE : PLAIN) : ASKING;

export function ChatMessage({
  message,
  boss,
  continued,
}: {
  message: Message;
  boss: string;
  continued: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  if (message.mine) {
    return (
      <div className={`${SHELL} items-end ${continued ? "-mt-4" : ""}`}>
        {continued ? null : (
          <div className={HEAD}>
            <span className={NAME}>{t("chat.you")}</span>
            <span className={TIME}>{message.time}</span>
          </div>
        )}
        <div className={MINE}>
          <div className={`${BODY} text-ink-bright`}>
            <RichText text={message.text} />
          </div>
          <ChatThumbs attachments={message.attachments} />
          <CopyButton text={message.text} className={COPY} />
        </div>
      </div>
    );
  }
  const name = message.who ?? boss;
  return (
    <div className={`${SHELL} ${continued ? "-mt-4" : ""}`}>
      {continued ? null : (
        <div className={HEAD}>
          {message.role === undefined ? null : (
            <Avatar initial={name.charAt(0).toUpperCase()} role={message.role} size="sm" />
          )}
          <span className={NAME}>{name}</span>
          {message.role === undefined ? null : (
            <span className={ROLE}>{t(ROLE_KEY[message.role])}</span>
          )}
          <span className={TIME}>{message.time}</span>
        </div>
      )}
      <div className={bubbleOf(message)}>
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
        <CopyButton text={message.text} className={COPY} />
      </div>
    </div>
  );
}
