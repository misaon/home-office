import type { AgentRole, AuthKind, EffortLevel, Gender, ProviderId } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { HireFields } from "./team-new-fields.tsx";
import { CAPTION } from "./tokens.ts";
import { useDesign } from "./store.ts";

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#0A0A0C",
};

export type Draft = {
  name: string;
  role: AgentRole;
  gender: Gender;
  provider: ProviderId;
  auth: AuthKind;
  model: string;
  effort: EffortLevel;
  basePrompt: string;
};

const EMPTY: Draft = {
  name: "",
  role: "worker",
  gender: "neutral",
  provider: "claude-code",
  auth: "subscription",
  model: "sonnet",
  effort: "high",
  basePrompt: "",
};

/** Hiring someone onto the floor: a name, the choices that make them, and a prompt they live by. */
export function TeamNew({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const patch = (next: Partial<Draft>): void => {
    setDraft((d) => ({ ...d, ...next }));
  };

  const create = useMutation({
    mutationFn: () =>
      requireClient().agents.create({
        projectId: floor.id,
        name: draft.name.trim(),
        role: draft.role,
        provider: draft.provider,
        auth: draft.auth,
        model: draft.model.trim(),
        effort: draft.effort,
        appearance: { gender: draft.gender },
        basePrompt: draft.basePrompt,
        skillPack: draft.role === "clerk" ? "none" : draft.role,
      }),
    onSuccess: () => {
      flash(t("agent.hired", { name: draft.name.trim(), floor: floor.name }));
      setDraft(EMPTY);
      set({ addAgent: false });
    },
    onError: (error: Error) => {
      flash(error.message);
    },
  });

  return (
    <div
      style={{
        padding: "15px",
        borderRadius: "14px",
        background: "#0F0F12",
        border: "1px solid #26262C",
        animation: "popIn .4s cubic-bezier(.2,.9,.3,1.05) both",
      }}
    >
      <div style={{ ...CAPTION, marginBottom: "7px" }}>{t("agent.name")}</div>
      <input
        value={draft.name}
        onChange={(e) => {
          patch({ name: e.target.value });
        }}
        placeholder={t("agent.namePlaceholder")}
        style={{ ...INPUT, fontSize: "13px", marginBottom: "13px" }}
      />
      <HireFields draft={draft} patch={patch} />
      <div style={{ ...CAPTION, margin: "13px 0 7px" }}>{t("agent.basePrompt")}</div>
      <textarea
        rows={3}
        value={draft.basePrompt}
        onChange={(e) => {
          patch({ basePrompt: e.target.value });
        }}
        placeholder={t("agent.promptPlaceholder")}
        style={{ ...INPUT, fontSize: "12.5px", resize: "none", lineHeight: "1.5" }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "13px" }}>
        <button
          type="button"
          disabled={draft.name.trim() === "" || create.isPending}
          onClick={() => {
            create.mutate();
          }}
          style={{
            padding: "9px 16px",
            borderRadius: "10px",
            border: "0",
            background: "var(--a,#FFC531)",
            color: "#150F02",
            fontSize: "12.5px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "all .22s",
          }}
          className="hopm"
        >
          {t("agent.add")}
        </button>
      </div>
    </div>
  );
}
