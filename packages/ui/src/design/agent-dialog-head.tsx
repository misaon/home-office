import { useTranslation } from "react-i18next";
import type { AgentDraft } from "./store.ts";
import { DISPLAY, MONO } from "./tokens.ts";

const AVATAR: React.CSSProperties = {
  width: "44px",
  height: "44px",
  flex: "0 0 44px",
  borderRadius: "14px",
  display: "grid",
  placeItems: "center",
  ...DISPLAY,
  fontWeight: "700",
  fontSize: "18px",
  boxShadow: "0 10px 26px rgba(0,0,0,.4)",
};

const PILL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "3px 9px 3px 7px",
  borderRadius: "99px",
};

/** Who is being hired or changed, and — when they already work here — what they are at. */
export function AgentDialogHead({
  draft,
  working,
  status,
  sub,
  isEdit,
}: {
  draft: AgentDraft;
  working: boolean;
  status: string;
  sub: string;
  isEdit: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const boss = draft.role === "boss";
  const dot = working ? "var(--a,#FFC531)" : "#8E8B85";
  return (
    <>
      <div
        style={{
          ...AVATAR,
          background: boss ? "linear-gradient(145deg,#FFD666,#E0A400)" : "#24242A",
          color: boss ? "#1A1300" : "#D6D3CD",
        }}
      >
        <span>{(draft.name === "" ? "?" : draft.name).charAt(0).toUpperCase()}</span>
      </div>
      <div style={{ flex: "1", minWidth: "0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
          <span
            style={{
              ...DISPLAY,
              fontWeight: "700",
              fontSize: "21px",
              letterSpacing: "-.015em",
              lineHeight: "1.15",
            }}
          >
            {isEdit ? (draft.name === "" ? t("agent.one") : draft.name) : t("agent.newTitle")}
          </span>
          {isEdit ? (
            <span
              style={{
                ...PILL,
                background: working ? "rgba(255,197,49,.1)" : "#1B1B20",
                border: `1px solid ${working ? "rgba(255,197,49,.3)" : "#2C2C32"}`,
              }}
            >
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: dot }} />
              <span style={{ ...MONO, fontSize: "9.5px", color: working ? "#FFD666" : "#A6A39C" }}>
                {status}
              </span>
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontSize: "12.5px",
            color: "#ABA8A1",
            marginTop: "7px",
            lineHeight: "1.6",
            textWrap: "pretty",
          }}
        >
          {sub}
        </div>
      </div>
    </>
  );
}

/** The one line that says what this colleague is doing right now, above everything you can change. */
export function AgentDoing({
  working,
  doing,
  since,
}: {
  working: boolean;
  doing: string;
  since: string;
}): React.JSX.Element {
  const dot = working ? "var(--a,#FFC531)" : "#8E8B85";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "11px",
        padding: "13px 14px",
        borderRadius: "13px",
        background: "#101013",
        border: "1px solid #232328",
        marginBottom: "20px",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          flex: "0 0 8px",
          borderRadius: "50%",
          background: dot,
          boxShadow: `0 0 10px ${dot}`,
        }}
      />
      <div style={{ flex: "1", minWidth: "0" }}>
        <div
          style={{
            fontSize: "12.5px",
            color: "#F2EFE8",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {doing}
        </div>
        <div style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C", marginTop: "4px" }}>
          {since}
        </div>
      </div>
    </div>
  );
}
