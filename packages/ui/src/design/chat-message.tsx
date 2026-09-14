import type { Message } from "./data.ts";
import { MONO } from "./tokens.ts";
import { useTranslation } from "react-i18next";
import { useDesign } from "./store.ts";

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

const THUMB: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: "10px",
  height: "118px",
  borderRadius: "10px",
  cursor: "pointer",
  border: "1px solid rgba(255,197,49,.3)",
  backgroundImage:
    "repeating-linear-gradient(135deg,rgba(255,197,49,.14) 0 8px,rgba(255,197,49,.04) 8px 16px)",
  transition: "all .22s",
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
  const set = useDesign((s) => s.set);
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
          {message.img === undefined ? null : (
            <button
              type="button"
              onClick={() => {
                if (message.attachment !== undefined) {
                  set({ lightbox: message.attachment });
                }
              }}
              style={THUMB}
              className="hop9"
            >
              <span style={{ ...MONO, fontSize: "10px", color: "#E4C778" }}>
                <span>{message.img}</span> · {t("chat.imageOpen")}
              </span>
            </button>
          )}
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
