import { ChatAttachment } from "./chat-attachment.tsx";
import { AttachMenu, UsageMenu, contextOf, contextPct } from "./chat-menus.tsx";
import { MONO } from "./tokens.ts";
import { useDesign, useFloor } from "./store.ts";

const BOX: React.CSSProperties = {
  borderRadius: "15px",
  border: "1px solid #2C2C32",
  background: "#111114",
  padding: "12px",
  transition: "border-color .25s,box-shadow .25s",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  border: "0",
  background: "transparent",
  fontSize: "13.5px",
  padding: "2px 2px 10px",
};

const SQUARE: React.CSSProperties = {
  width: "28px",
  height: "28px",
  display: "grid",
  placeItems: "center",
  border: "1px solid #2C2C32",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "all .25s",
};

const METER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  height: "28px",
  padding: "0 10px",
  border: "1px solid #2C2C32",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "all .2s",
};

const SEND: React.CSSProperties = {
  width: "32px",
  height: "32px",
  flex: "0 0 32px",
  display: "grid",
  placeItems: "center",
  border: "0",
  borderRadius: "10px",
  background: "var(--a,#FFC531)",
  color: "#150F02",
  cursor: "pointer",
  transition: "all .22s cubic-bezier(.2,.8,.3,1)",
};

/** Where a message is written: what is attached, what it costs, and the button that sends it. */
export function ChatComposer(): React.JSX.Element {
  const floor = useFloor();
  const draft = useDesign((s) => s.draft);
  const attachment = useDesign((s) => s.attachment);
  const attachOpen = useDesign((s) => s.attachOpen);
  const usageOpen = useDesign((s) => s.usageOpen);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const send = useDesign((s) => s.send);
  const context = contextOf(floor.messages.length);

  return (
    <div style={{ flex: "0 0 auto", padding: "12px 16px 16px" }}>
      <div style={BOX} className="hopa">
        {attachment === null ? null : <ChatAttachment file={attachment} />}
        <input
          value={draft}
          onChange={(e) => {
            set({ draft: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the floor for something…"
          style={INPUT}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ position: "relative", flex: "0 0 auto" }}>
            <button
              type="button"
              aria-label="Attach something"
              onClick={() => {
                update((s) => ({ attachOpen: !s.attachOpen, usageOpen: false, openSelect: null }));
              }}
              style={{
                ...SQUARE,
                background: attachOpen ? "rgba(255,197,49,.14)" : "transparent",
                color: attachOpen ? "#FFD666" : "#CFCCC6",
              }}
              className="hopc"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <line x1="6" y1="2" x2="6" y2="10" />
                <line x1="2" y1="6" x2="10" y2="6" />
              </svg>
            </button>
            {attachOpen ? <AttachMenu /> : null}
          </div>
          <div style={{ flex: "1" }} />
          <div style={{ position: "relative", flex: "0 0 auto" }}>
            <button
              type="button"
              onClick={() => {
                update((s) => ({ usageOpen: !s.usageOpen, attachOpen: false, openSelect: null }));
              }}
              title="AI usage and limits"
              style={{
                ...METER,
                background: usageOpen ? "rgba(255,197,49,.14)" : "transparent",
                color: usageOpen ? "#FFD666" : "#CFCCC6",
              }}
              className="hop8"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 14 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <line x1="2.5" y1="11" x2="2.5" y2="7" />
                <line x1="7" y1="11" x2="7" y2="3.5" />
                <line x1="11.5" y1="11" x2="11.5" y2="5.5" />
              </svg>
              <span style={{ ...MONO, fontSize: "10.5px" }}>{contextPct(context)}</span>
            </button>
            {usageOpen ? <UsageMenu context={context} /> : null}
          </div>
          <button type="button" aria-label="Send" onClick={send} style={SEND} className="hopf">
            <svg
              width="13"
              height="13"
              viewBox="0 0 14 14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            >
              <line x1="7" y1="11.5" x2="7" y2="2.5" />
              <polyline points="3,6.5 7,2.5 11,6.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
