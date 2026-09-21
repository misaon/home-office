import { CopyButton } from "./chat-copy.tsx";
import type { Message } from "./data.ts";
import { RichText } from "./markdown.tsx";
import { MONO } from "./tokens.ts";

const LEAD = /^(?<glyph>\p{Extended_Pictographic}️?)\s*(?<rest>[\s\S]*)$/u;

const ROW = "group relative flex items-start gap-9 py-4 pl-4 pr-3 rounded-10 animate-fade-240";

const TROUBLE = "bg-bad-a08 border border-bad-a28";

const GLYPH =
  "flex-[0_0_22px] w-22 h-22 rounded-half grid place-items-center text-11 leading-none bg-sunk border border-line";

const TEXT =
  "flex-1 min-w-0 pt-2 text-12h leading-text text-ink-quiet [&_.ho-md_strong]:text-ink-soft [&_.ho-md_strong]:font-medium";

const TIME = `${MONO} text-9h tracking-mono text-ink-idle flex-[0_0_auto] pt-4`;

export function ChatStatus({ message }: { message: Message }): React.JSX.Element {
  const parsed = LEAD.exec(message.text)?.groups;
  const glyph = parsed?.["glyph"] ?? "•";
  const rest = parsed?.["rest"] ?? message.text;
  const trouble = message.tone === "trouble";
  return (
    <div className={`${ROW} ${trouble ? TROUBLE : ""}`}>
      <span className={`${GLYPH} ${trouble ? "border-bad-a45 bg-bad-a12" : ""}`} aria-hidden="true">
        {glyph}
      </span>
      <div className={TEXT}>
        <RichText text={rest} />
      </div>
      <span className={TIME}>{message.time}</span>
      <CopyButton text={message.text} className="flex-[0_0_auto]" />
    </div>
  );
}
