import { defaultChoice } from "@ho/core";
import { EffortLevel, ProviderId, type AgentRole } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AgentDialogFields, AgentPrompt } from "./agent-dialog-fields.tsx";
import { AgentDialogHead, AgentDoing } from "./agent-dialog-head.tsx";
import { RoleCards } from "./agent-roles.tsx";
import type { Floor, Member } from "./data.ts";
import { CANCEL, CAP, COMMIT, DialogSheet, HINT } from "./dialog-sheet.tsx";
import { requireClient } from "../rpc.ts";
import { type AgentDraft, useDesign } from "./store.ts";

const REMOVE: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "11px",
  border: "1px solid rgba(255,122,122,.3)",
  background: "rgba(255,122,122,.1)",
  color: "#FFB3B3",
  fontSize: "12.5px",
  cursor: "pointer",
  flex: "0 0 auto",
  transition: "all .2s",
};

/** What a new hire starts as: Claude Code at the catalogue's own defaults for the role it takes. */
export const newDraft = (hasBoss: boolean): AgentDraft => {
  const role: AgentRole = hasBoss ? "worker" : "boss";
  return {
    name: "",
    role,
    gender: "neutral",
    provider: "claude-code",
    prompt: "",
    ...defaultChoice("claude-code", role),
  };
};

export const draftOf = (member: Member): AgentDraft => ({
  name: member.name,
  role: member.role,
  gender: member.gender,
  provider: member.provider,
  auth: member.auth,
  model: member.model,
  effort: member.effort,
  prompt: member.prompt,
});

/** Remove on the left, what will be saved in the middle, and the two ways out. */
function AgentDialogFoot({
  id,
  name,
  draft,
  busy,
  onCancel,
  onSave,
  onRemove,
}: {
  id: Member["id"] | null;
  name: string;
  draft: AgentDraft;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
  onRemove: (id: Member["id"]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const confirm = useDesign((s) => s.confirm);
  return (
    <>
      {id === null ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            confirm({
              title: t("agent.removeTitle"),
              body: t("agent.confirmRemove", { name: draft.name }),
              okLabel: t("common.remove"),
              act: () => {
                onRemove(id);
              },
            });
          }}
          style={REMOVE}
          className="ho-52fd80"
        >
          {t("common.remove")}
        </button>
      )}
      <span style={HINT}>
        {name === ""
          ? t("agent.nameFirst")
          : `${draft.provider} · ${draft.model} / ${draft.effort}`}
      </span>
      <button type="button" onClick={onCancel} style={CANCEL} className="ho-2955a9">
        {t("common.cancel")}
      </button>
      <button
        type="button"
        disabled={name === "" || busy}
        onClick={onSave}
        style={{
          ...COMMIT,
          background: name === "" ? "#24242A" : "var(--a,#FFC531)",
          color: name === "" ? "#8A8780" : "#150F02",
        }}
        className="ho-373252"
      >
        {id === null ? t("agent.hire") : t("agent.save")}
      </button>
    </>
  );
}

/**
 * Hiring a colleague, or changing one. The floor's boss is fixed — the daemon refuses a second one and
 * refuses to demote the first — so the boss card names whoever holds it instead of offering a swap.
 */
/** One draft, sent the way the office sends it: a patch for someone here, a whole hire for someone new. */
async function commit(
  draft: AgentDraft,
  name: string,
  projectId: Floor["id"],
  id: Member["id"] | null,
): Promise<void> {
  const shared = {
    name,
    role: draft.role,
    provider: ProviderId.parse(draft.provider),
    auth: draft.auth,
    model: draft.model.trim(),
    effort: EffortLevel.parse(draft.effort),
    basePrompt: draft.prompt,
  };
  if (id !== null) {
    await requireClient().agents.update({ id, patch: shared });
    return;
  }
  await requireClient().agents.create({
    ...shared,
    projectId,
    appearance: { gender: draft.gender },
    skillPack: draft.role === "clerk" ? "none" : draft.role,
  });
}

export function AgentDialog({ floor }: { floor: Floor }): React.JSX.Element | null {
  const { t } = useTranslation();
  const dlg = useDesign((s) => s.agentDlg);
  const draft = useDesign((s) => s.agentDraft);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const flash = useDesign((s) => s.flash);

  const editing = dlg?.mode === "edit" ? floor.team.find((p) => p.id === dlg.id) : undefined;
  const close = (): void => {
    set({ agentDlg: null, agentDraft: null, openSelect: null });
  };
  const done = (message: string): void => {
    close();
    flash(message);
  };
  const fail = (error: Error): void => {
    flash(error.message);
  };
  const name = draft === null ? "" : draft.name.trim();

  const save = useMutation({
    mutationFn: () =>
      draft === null
        ? Promise.resolve()
        : commit(draft, name, floor.id, dlg?.mode === "edit" ? dlg.id : null),
    onSuccess: () => {
      done(
        dlg?.mode === "edit"
          ? t("agent.updated", { name })
          : t("agent.hired", { name, floor: floor.name }),
      );
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: Member["id"]) => requireClient().agents.remove({ id }),
    onSuccess: () => {
      done(t("agent.removed", { name, floor: floor.name }));
    },
    onError: fail,
  });

  if (dlg === null || draft === null) {
    return null;
  }
  const isEdit = dlg.mode === "edit";
  const working = editing?.status === "working";
  const boss = floor.team.find((p) => p.role === "boss" && p.id !== editing?.id);
  const patch = (next: Partial<AgentDraft>): void => {
    update((s) => ({ agentDraft: s.agentDraft === null ? null : { ...s.agentDraft, ...next } }));
  };
  const pickRole = (role: AgentRole): void => {
    if (role === "boss" && boss !== undefined) {
      flash(t("agent.bossTaken", { name: boss.name }));
      return;
    }
    if (role !== "boss" && editing?.role === "boss") {
      flash(t("agent.bossStays"));
      return;
    }
    patch({ role });
    set({ openSelect: null });
  };

  return (
    <DialogSheet
      open
      width="min(640px,100%)"
      label={isEdit ? draft.name : t("agent.newTitle")}
      onClose={close}
      head={
        <AgentDialogHead
          draft={draft}
          working={working}
          status={t(working ? "team.working" : "team.idle")}
          sub={
            isEdit
              ? t("agent.editSub", { floor: floor.name })
              : t("agent.newSub", { floor: floor.name })
          }
          isEdit={isEdit}
        />
      }
      footer={
        <AgentDialogFoot
          id={dlg.mode === "edit" ? dlg.id : null}
          name={name}
          draft={draft}
          busy={save.isPending || remove.isPending}
          onCancel={close}
          onSave={() => {
            save.mutate();
          }}
          onRemove={(id) => {
            remove.mutate(id);
          }}
        />
      }
    >
      {isEdit && editing !== undefined ? (
        <AgentDoing working={working} doing={editing.doing} since={editing.since} />
      ) : null}
      <div style={{ ...CAP, marginBottom: "10px" }}>{t("agent.whoTheyAre")}</div>
      <RoleCards value={draft.role} bossName={boss?.name ?? null} onPick={pickRole} />
      <AgentDialogFields draft={draft} patch={patch} />
      <AgentPrompt
        value={draft.prompt}
        onChange={(prompt) => {
          patch({ prompt });
        }}
      />
    </DialogSheet>
  );
}
