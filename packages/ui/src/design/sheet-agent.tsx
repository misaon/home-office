import { useTranslation } from "react-i18next";
import { draftOf } from "./agent-dialog.tsx";
import type { Member } from "./data.ts";
import { useAgentWork } from "./live.ts";
import { AgentStatus } from "./sheet-agent-status.tsx";
import { CAPS, PRIMARY, SheetShell } from "./sheet-shell.tsx";
import { MONO, separator } from "./tokens.ts";
import { useDesign } from "./store.ts";

const LIST: React.CSSProperties = {
  borderRadius: "13px",
  background: "#101013",
  border: "1px solid #232328",
  overflow: "hidden",
  marginBottom: "16px",
};

/** One colleague, opened up: what they are doing now, what they have been doing, and the way in. */
export function AgentSheet({ draft }: { draft: Member }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const work = useAgentWork(draft.id);

  return (
    <SheetShell
      title={draft.name}
      subtitle={`${draft.provider} · ${draft.model} / ${draft.effort}`}
    >
      <AgentStatus draft={draft} />
      <div style={{ ...CAPS, marginBottom: "10px" }}>{t("agent.recentWork")}</div>
      <div style={LIST}>
        {work.map((row, i) => (
          <div
            key={row.x}
            style={{
              display: "flex",
              gap: "11px",
              padding: "12px 13px",
              borderTop: `1px solid ${separator(i === 0)}`,
            }}
          >
            <span style={{ ...MONO, fontSize: "10px", color: "#A6A39C", flex: "0 0 auto" }}>
              {row.t}
            </span>
            <span style={{ fontSize: "12.5px", color: "#E4E1DB", lineHeight: "1.5" }}>{row.x}</span>
          </div>
        ))}
        {work.length === 0 ? (
          <div style={{ padding: "12px 13px", fontSize: "12px", color: "#A6A39C" }}>
            {t("agent.noWork")}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          set({
            agentDlg: { mode: "edit", id: draft.id },
            agentDraft: draftOf(draft),
            sheet: null,
            sheetDraft: null,
            openSelect: null,
          });
        }}
        style={{ ...PRIMARY, width: "100%" }}
        className="ho-7cc9cc"
      >
        {t("agent.configure")}
      </button>
    </SheetShell>
  );
}
