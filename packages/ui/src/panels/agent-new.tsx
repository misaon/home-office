import {
  AgentRole,
  type EffortLevel,
  errorMessage,
  Gender,
  type ProjectId,
  type ProviderId,
  PROVIDERS,
} from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";
import { type Choice, ProviderModelFields } from "./agent-fields.tsx";

/** Roles a floor hires; the boss comes with the floor. */
const ROLES = AgentRole.options.filter((r) => r !== "boss");
const GENDERS = Gender.options;
/** Claude Code aliases per role (D12); other providers start from their catalog default. */
const DEFAULT_MODEL: Record<AgentRole, string> = {
  boss: "opus",
  worker: "sonnet",
  reviewer: "sonnet",
  clerk: "haiku",
};

type Draft = Choice & {
  name: string;
  role: AgentRole;
  spriteSet: string;
  gender: Gender;
  basePrompt: string;
};

const emptyDraft = (spriteSet: string): Draft => ({
  name: "",
  role: "worker",
  provider: "claude-code",
  auth: "subscription",
  model: "sonnet",
  effort: "medium",
  spriteSet,
  gender: "neutral",
  basePrompt: "",
});

const effortFor = (provider: ProviderId, current: EffortLevel): EffortLevel => {
  const levels = PROVIDERS[provider].effortLevels;
  return levels.length === 0 || levels.includes(current) ? current : (levels[0] ?? current);
};

/** The "new agent" form of a floor: a draft plus the provider catalog's valid combinations. */
export function NewAgent({ floorId }: { floorId: ProjectId }): React.JSX.Element {
  const spriteSets = useUi((s) => s.spriteSets);
  const [draft, setDraft] = useState<Draft>(emptyDraft(spriteSets[0] ?? "agent-a"));
  const create = useMutation({
    mutationFn: () =>
      requireClient().agents.create({
        projectId: floorId,
        name: draft.name.trim(),
        role: draft.role,
        provider: draft.provider,
        auth: draft.auth,
        model: draft.model.trim(),
        effort: draft.effort,
        appearance: { spriteSet: draft.spriteSet, gender: draft.gender },
        basePrompt: draft.basePrompt,
        skillPack: draft.role === "clerk" ? "none" : draft.role,
      }),
    onSuccess: () => {
      setDraft(emptyDraft(spriteSets[0] ?? "agent-a"));
    },
  });
  const add = (): void => {
    if (draft.name.trim() !== "") {
      create.mutate();
    }
  };
  return (
    <div className="grid grid-cols-2 gap-1 rounded border border-dashed border-line p-2 text-[11px]">
      <input
        className="col-span-2 rounded bg-panel px-2 py-1"
        placeholder="Name"
        value={draft.name}
        onChange={(e) => {
          setDraft({ ...draft, name: e.target.value });
        }}
      />
      <select
        className="rounded bg-panel px-1 py-1"
        value={draft.role}
        onChange={(e) => {
          const role = AgentRole.parse(e.target.value);
          setDraft({
            ...draft,
            role,
            ...(draft.provider === "claude-code" ? { model: DEFAULT_MODEL[role] } : {}),
          });
        }}
      >
        {ROLES.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <ProviderModelFields
        value={draft}
        onChange={(next) => {
          setDraft({ ...draft, ...next, effort: effortFor(next.provider, next.effort) });
        }}
      />
      <select
        className="rounded bg-panel px-1 py-1"
        value={draft.spriteSet}
        onChange={(e) => {
          setDraft({ ...draft, spriteSet: e.target.value });
        }}
      >
        {(spriteSets.length === 0 ? [draft.spriteSet] : spriteSets).map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <select
        className="rounded bg-panel px-1 py-1"
        value={draft.gender}
        onChange={(e) => {
          setDraft({ ...draft, gender: Gender.parse(e.target.value) });
        }}
      >
        {GENDERS.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <textarea
        className="col-span-2 h-14 rounded bg-panel px-2 py-1"
        placeholder="Base prompt (persona, habits, constraints)"
        value={draft.basePrompt}
        onChange={(e) => {
          setDraft({ ...draft, basePrompt: e.target.value });
        }}
      />
      <button
        type="button"
        className="rounded bg-accent px-2 py-1 text-black disabled:opacity-50"
        disabled={create.isPending}
        onClick={add}
      >
        Add agent
      </button>
      {create.error === null ? null : (
        <p className="col-span-2 text-red-400">{errorMessage(create.error)}</p>
      )}
    </div>
  );
}
