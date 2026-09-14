import type { Message } from "./data.ts";
import { MONO } from "./tokens.ts";
import { useTranslation } from "react-i18next";
import { ChatThumb } from "./chat-thumb.tsx";

const META: React.CSSProperties = { ...MONO, fontSize: "10px", letterSpacing: ".04em" };
const BODY: React.CSSProperties = { fontSize: "13.5px", lineHeight: "1.55", textWrap: "pretty" };

const MINE: React.CSSProperties = {
  maxWidth: "90%",
  marginLeft: "auto",
  padding: "11px 13px",
  borderRadius: "15px 15px 5px 15px",
  background: "linear-gradient(160deg,rgba(255,197,49,.17),rgba(255,197,49,.08))",
  border: "1px solid rgba(255,197,49,.3)",
};

const THEIRS: React.CSSProperties = {
  maxWidth: "92%",
  marginRight: "auto",
  padding: "11px 13px",
  borderRadius: "15px 15px 15px 5px",
  background: "#141418",
  border: "1px solid #26262C",
};

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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        animation: "fadeUp .45s cubic-bezier(.2,.8,.3,1) both",
      }}
    >
      {message.mine ? (
        <div style={MINE}>
          <div style={{ ...META, color: "#E4C778", marginBottom: "5px" }}>
            {t("chat.you")} · <span>{message.time}</span>
          </div>
          <div style={{ ...BODY, color: "#F9F4E7" }}>{message.text}</div>
          {message.attachment === undefined ? null : <ChatThumb attachment={message.attachment} />}
        </div>
      ) : (
        <div style={THEIRS}>
          <div style={{ ...META, color: "#ABA8A1", marginBottom: "6px" }}>
            <span>{message.who ?? boss}</span> · <span>{message.time}</span>
          </div>
          <div style={{ ...BODY, color: "#E9E7E2" }}>{message.text}</div>
        </div>
      )}
    </div>
  );
}
