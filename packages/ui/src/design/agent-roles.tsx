import { defaultChoice } from "@ho/core";
import { AgentRole, ProviderId } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { SelectField } from "./select-field.tsx";
import { type AgentDraft, useDesign } from "./store.ts";

const ICON = {
  width: "17",
  height: "17",
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const ROLE_MARKS: Record<AgentRole, React.JSX.Element> = {
  boss: (
    <svg {...ICON}>
      <path d="M2.5 11.5 4 5l3 3 1-4 1 4 3-3 1.5 6.5z" />
    </svg>
  ),
  secretary: (
    <svg {...ICON}>
      <path d="M3.5 9V7.5a4.5 4.5 0 0 1 9 0V9" />
      <rect x="2.2" y="8.6" width="2.6" height="3.6" rx="1" />
      <rect x="11.2" y="8.6" width="2.6" height="3.6" rx="1" />
      <path d="M12.5 12.2v.6a1.4 1.4 0 0 1-1.4 1.4H9" />
    </svg>
  ),
  analyst: (
    <svg {...ICON}>
      <rect x="3" y="2.5" width="10" height="11" rx="1.4" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
    </svg>
  ),
  backend: (
    <svg {...ICON}>
      <rect x="2.5" y="3" width="11" height="4" rx="1" />
      <rect x="2.5" y="9" width="11" height="4" rx="1" />
      <path d="M5 5h.01M5 11h.01" />
    </svg>
  ),
  frontend: (
    <svg {...ICON}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.4" />
      <path d="M2.5 6h11M5.5 9.5h3" />
    </svg>
  ),
  devops: (
    <svg {...ICON}>
      <path d="M5 11.5H4.3a2.3 2.3 0 0 1-.3-4.6 3.5 3.5 0 0 1 6.8-.9 2.75 2.75 0 0 1 .7 5.5H11" />
      <path d="M8 13.5V8.5M6 10.5l2-2 2 2" />
    </svg>
  ),
  qa: (
    <svg {...ICON}>
      <path d="M8 3.5a3.5 3.5 0 0 1 3.5 3.5v2a3.5 3.5 0 1 1-7 0V7A3.5 3.5 0 0 1 8 3.5z" />
      <path d="M6.2 4.6 5 3.2M9.8 4.6 11 3.2M4.5 8h-2M13.5 8h-2M8 9v3.5" />
    </svg>
  ),
  security: (
    <svg {...ICON}>
      <path d="M8 2.5 12.8 4.3v3.4c0 3-2 5-4.8 5.8C5.2 12.7 3.2 10.7 3.2 7.7V4.3z" />
      <polyline points="5.8,8 7.3,9.5 10.2,6.4" />
    </svg>
  ),
  head: (
    <svg {...ICON}>
      <circle cx="6.9" cy="6.9" r="4.3" />
      <line x1="10.1" y1="10.1" x2="13.6" y2="13.6" />
      <polyline points="5.2,6.9 6.5,8.2 8.7,5.4" />
    </svg>
  ),
  developer: (
    <svg {...ICON}>
      <circle cx="8" cy="5.6" r="2.4" />
      <path d="M3.4 13c.6-2.4 2.4-3.6 4.6-3.6S12 10.6 12.6 13" />
    </svg>
  ),
};

const presetDraft = (
  role: AgentRole,
  draft: AgentDraft,
  name: string,
  prompt: string,
): AgentDraft => {
  const parsed = ProviderId.safeParse(draft.provider);
  const provider = parsed.success ? parsed.data : "claude-code";
  return {
    ...draft,
    ...defaultChoice(provider, role),
    role,
    name: draft.name === "" ? name : draft.name,
    prompt: prompt !== "" && draft.prompt === "" ? prompt : draft.prompt,
  };
};

export function RoleSelect({
  draft,
  bossTaken,
  bossLocked,
  preset,
  patch,
}: {
  draft: AgentDraft;
  bossTaken: boolean;
  bossLocked: boolean;
  preset: boolean;
  patch: (next: Partial<AgentDraft>) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const offered = AgentRole.options.filter(
    (role) => role === draft.role || role !== "boss" || !bossTaken,
  );
  const labelOf = (role: AgentRole): string => t(`agent.role_${role}`);
  const roleOf = (label: string): AgentRole | undefined =>
    offered.find((role) => labelOf(role) === label);
  const pick = (role: AgentRole): void => {
    if (role !== "boss" && bossLocked) {
      flash(t("agent.bossStays"));
      return;
    }
    if (preset) {
      patch(
        presetDraft(role, draft, t(`agent.presetName_${role}`), t(`agent.presetPrompt_${role}`)),
      );
      return;
    }
    patch({ role });
  };
  return (
    <div className="mb-18">
      <SelectField
        label={t(preset ? "agent.presetLead" : "agent.whoTheyAre")}
        options={offered.map((role) => labelOf(role))}
        value={labelOf(draft.role)}
        markOf={(option) => {
          const role = roleOf(option);
          return role === undefined ? null : ROLE_MARKS[role];
        }}
        onPick={(next) => {
          const role = roleOf(next);
          if (role !== undefined) {
            pick(role);
          }
        }}
      />
      <div className="text-11 text-ink-meta mt-8 leading-prose">
        {t(`agent.roleDesc_${draft.role}`)}
      </div>
    </div>
  );
}
