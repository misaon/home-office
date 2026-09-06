import { type Agent, type AgentUpdateInput, AgentRole, EffortLevel, Gender } from "@ho/protocol";
import { useState } from "react";
import { getClient } from "../rpc.ts";
import { type Snapshot, useUi } from "../store.ts";

const ROLES = AgentRole.options;
const EFFORTS = EffortLevel.options;
const GENDERS = Gender.options;
const DEFAULT_MODEL: Record<AgentRole, string> = {
  boss: "opus",
  worker: "sonnet",
  reviewer: "sonnet",
  clerk: "haiku",
};

type Draft = {
  name: string;
  role: AgentRole;
  model: string;
  effort: EffortLevel;
  spriteSet: string;
  gender: Gender;
  basePrompt: string;
};

const emptyDraft = (spriteSet: string): Draft => ({
  name: "",
  role: "worker",
  model: "sonnet",
  effort: "medium",
  spriteSet,
  gender: "neutral",
  basePrompt: "",
});

type RowProps = { agent: Agent; snapshot: Snapshot; onError: (e: unknown) => void };

function AgentRow({ agent, snapshot, onError }: RowProps): React.JSX.Element {
  const spriteSets = useUi((s) => s.spriteSets);
  const projects = [...snapshot.projects.values()].filter((p) => p.repo.kind !== "none");
  const update = (patch: AgentUpdateInput["patch"]): void => {
    getClient()?.agents.update({ id: agent.id, patch }).catch(onError);
  };
  const sprites = [
    agent.appearance.spriteSet,
    ...spriteSets.filter((s) => s !== agent.appearance.spriteSet),
  ];
  return (
    <div className="rounded border border-line bg-panel p-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {agent.name} <span className="text-gray-400">· {agent.role}</span>
        </span>
        <button
          type="button"
          className="text-[11px] text-red-300 hover:underline"
          onClick={() => {
            if (window.confirm(`Remove ${agent.name}?`)) {
              getClient()?.agents.remove({ id: agent.id }).catch(onError);
            }
          }}
        >
          remove
        </button>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
        <label className="flex items-center gap-1">
          model
          <input
            className="w-full rounded bg-ink px-1"
            defaultValue={agent.model}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== "" && value !== agent.model) {
                update({ model: value });
              }
            }}
          />
        </label>
        <label className="flex items-center gap-1">
          effort
          <select
            className="rounded bg-ink px-1"
            value={agent.effort}
            onChange={(e) => {
              update({ effort: EffortLevel.parse(e.target.value) });
            }}
          >
            {EFFORTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          sprite
          <select
            className="rounded bg-ink px-1"
            value={agent.appearance.spriteSet}
            onChange={(e) => {
              update({ appearance: { ...agent.appearance, spriteSet: e.target.value } });
            }}
          >
            {sprites.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          gender
          <select
            className="rounded bg-ink px-1"
            value={agent.appearance.gender}
            onChange={(e) => {
              update({ appearance: { ...agent.appearance, gender: Gender.parse(e.target.value) } });
            }}
          >
            {GENDERS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
        {projects.map((p) => {
          const member = agent.projectIds.includes(p.id);
          return (
            <label key={p.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={member}
                onChange={() => {
                  update({
                    projectIds: member
                      ? agent.projectIds.filter((id) => id !== p.id)
                      : [...agent.projectIds, p.id],
                  });
                }}
              />
              {p.name}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function NewAgent({ onError }: { onError: (e: unknown) => void }): React.JSX.Element {
  const spriteSets = useUi((s) => s.spriteSets);
  const [draft, setDraft] = useState<Draft>(emptyDraft(spriteSets[0] ?? "agent-a"));
  const add = (): void => {
    const client = getClient();
    if (client === null || draft.name.trim() === "") {
      return;
    }
    client.agents
      .create({
        name: draft.name.trim(),
        role: draft.role,
        provider: "claude-code",
        model: draft.model.trim(),
        effort: draft.effort,
        appearance: { spriteSet: draft.spriteSet, gender: draft.gender },
        basePrompt: draft.basePrompt,
        skillPack: draft.role,
      })
      .then(() => {
        setDraft(emptyDraft(spriteSets[0] ?? "agent-a"));
      }, onError);
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
          setDraft({ ...draft, role, model: DEFAULT_MODEL[role] });
        }}
      >
        {ROLES.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <input
        className="rounded bg-panel px-2 py-1"
        value={draft.model}
        onChange={(e) => {
          setDraft({ ...draft, model: e.target.value });
        }}
      />
      <select
        className="rounded bg-panel px-1 py-1"
        value={draft.effort}
        onChange={(e) => {
          setDraft({ ...draft, effort: EffortLevel.parse(e.target.value) });
        }}
      >
        {EFFORTS.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
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
      <button type="button" className="rounded bg-accent px-2 py-1 text-black" onClick={add}>
        Add agent
      </button>
    </div>
  );
}

export function AgentsSettings(): React.JSX.Element {
  const snapshot = useUi((s) => s.snapshot);
  const [error, setError] = useState<string | null>(null);
  const agents = [...snapshot.agents.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  const onError = (e: unknown): void => {
    setError(e instanceof Error ? e.message : String(e));
  };
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] tracking-wide text-gray-400 uppercase">Agents</h3>
      {agents.map((a) => (
        <AgentRow key={a.id} agent={a} snapshot={snapshot} onError={onError} />
      ))}
      <NewAgent onError={onError} />
      {error === null ? null : <p className="text-red-400">{error}</p>}
    </section>
  );
}
