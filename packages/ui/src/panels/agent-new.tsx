import {
  AgentRole,
  type EffortLevel,
  errorMessage,
  Gender,
  type ProjectId,
  type ProviderId,
  PROVIDERS,
} from "@ho/protocol";
import { defaultChoice } from "@ho/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";
import { type Choice, ProviderModelFields } from "./agent-fields.tsx";

/** Roles a floor hires; the boss comes with the floor. */
const ROLES = AgentRole.options.filter((r) => r !== "boss");
const GENDERS = Gender.options;
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
  ...defaultChoice("claude-code", "worker"),
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
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-dashed border-line p-4 text-xs">
      <input
        className="col-span-2 rounded-md border border-line bg-ink px-3 py-2"
        placeholder="Name"
        value={draft.name}
        onChange={(e) => {
          setDraft({ ...draft, name: e.target.value });
        }}
      />
      <select
        className="rounded-md border border-line bg-ink px-2 py-1.5"
        value={draft.role}
        onChange={(e) => {
          const role = AgentRole.parse(e.target.value);
          setDraft({
            ...draft,
            role,
            ...defaultChoice(draft.provider, role),
          });
        }}
      >
        {ROLES.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <ProviderModelFields
        value={draft}
        role={draft.role}
        onChange={(next) => {
          setDraft({ ...draft, ...next, effort: effortFor(next.provider, next.effort) });
        }}
      />
      <select
        className="rounded-md border border-line bg-ink px-2 py-1.5"
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
        className="rounded-md border border-line bg-ink px-2 py-1.5"
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
        className="col-span-2 h-20 resize-none rounded-md border border-line bg-ink px-3 py-2"
        placeholder="Base prompt (persona, habits, constraints)"
        value={draft.basePrompt}
        onChange={(e) => {
          setDraft({ ...draft, basePrompt: e.target.value });
        }}
      />
      <div className="col-span-2 flex justify-end">
        <Button variant="primary" disabled={create.isPending} onClick={add}>
          Add agent
        </Button>
      </div>
      {create.error === null ? null : (
        <p className="col-span-2 text-red-400">{errorMessage(create.error)}</p>
      )}
    </div>
  );
}
