import { AgentRole, EffortLevel, ProviderId } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Floor, Member } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { AgentStatus } from "./sheet-agent-status.tsx";
import { AgentFields } from "./sheet-agent-fields.tsx";
import { CAPS, FIELD, PRIMARY, SheetShell } from "./sheet-shell.tsx";
import { useDesign } from "./store.ts";

const DANGER: React.CSSProperties = {
  padding: "11px 15px",
  borderRadius: "11px",
  border: "1px solid rgba(255,122,122,.3)",
  background: "rgba(255,122,122,.1)",
  color: "#FFB3B3",
  fontSize: "12.5px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "all .2s",
};

/** One colleague, opened up: what they are doing now, and everything you can change about them. */
export function AgentSheet({ draft, floor }: { draft: Member; floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const flash = useDesign((s) => s.flash);
  const done = (message: string): void => {
    set({ sheet: null, sheetDraft: null });
    flash(message);
  };
  const fail = (error: Error): void => {
    flash(error.message);
  };

  const save = useMutation({
    mutationFn: () =>
      requireClient().agents.update({
        id: draft.id,
        patch: {
          name: draft.name.trim(),
          role: AgentRole.parse(draft.role),
          provider: ProviderId.parse(draft.provider),
          model: draft.model.trim(),
          effort: EffortLevel.parse(draft.effort),
          basePrompt: draft.prompt,
        },
      }),
    onSuccess: () => {
      done(t("agent.updated", { name: draft.name }));
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => requireClient().agents.remove({ id: draft.id }),
    onSuccess: () => {
      done(t("agent.removed", { name: draft.name, floor: floor.name }));
    },
    onError: fail,
  });

  const patch = (next: Partial<Member>): void => {
    update((s) => ({ sheetDraft: s.sheetDraft === null ? null : { ...s.sheetDraft, ...next } }));
  };

  return (
    <SheetShell
      title={draft.name}
      subtitle={`${draft.provider} · ${draft.model} / ${draft.effort}`}
    >
      <AgentStatus draft={draft} />
      <div style={{ ...CAPS, marginBottom: "7px" }}>{t("agent.name")}</div>
      <input
        value={draft.name}
        onChange={(e) => {
          patch({ name: e.target.value });
        }}
        style={{ ...FIELD, fontSize: "13px", marginBottom: "14px" }}
      />
      <AgentFields draft={draft} patch={patch} />
      <div style={{ ...CAPS, marginBottom: "7px" }}>{t("agent.basePrompt")}</div>
      <textarea
        rows={5}
        value={draft.prompt}
        onChange={(e) => {
          patch({ prompt: e.target.value });
        }}
        style={{
          ...FIELD,
          padding: "11px 12px",
          fontSize: "12.5px",
          resize: "none",
          lineHeight: "1.55",
          marginBottom: "16px",
        }}
      />
      <div style={{ display: "flex", gap: "9px" }}>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            save.mutate();
          }}
          style={PRIMARY}
          className="hopm"
        >
          {t("agent.save")}
        </button>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate();
          }}
          style={DANGER}
          className="hopp"
        >
          {t("common.remove")}
        </button>
      </div>
    </SheetShell>
  );
}
