import { type Agent, type AgentUpdateInput, errorMessage, Gender, ProjectId } from "@ho/protocol";

const GENDERS = Gender.options;
import { useMutation } from "@tanstack/react-query";
import { requireClient } from "../rpc.ts";
import { type Snapshot, sortedFloors, useUi } from "../store.ts";
import { type Choice, ProviderModelFields } from "./agent-fields.tsx";
import { NewAgent } from "./agent-new.tsx";

const choiceOf = (agent: Agent): Choice => ({
  provider: agent.provider,
  auth: agent.auth,
  model: agent.model,
  effort: agent.effort,
});

type RowProps = { agent: Agent; snapshot: Snapshot };

function AgentRow({ agent, snapshot }: RowProps): React.JSX.Element {
  const spriteSets = useUi((s) => s.spriteSets);
  const otherFloors = sortedFloors(snapshot).filter((p) => p.id !== agent.projectId);
  const save = useMutation({
    mutationFn: (patch: AgentUpdateInput["patch"]) =>
      requireClient().agents.update({ id: agent.id, patch }),
  });
  const copy = useMutation({
    mutationFn: (projectId: ProjectId) => requireClient().agents.copy({ id: agent.id, projectId }),
  });
  const remove = useMutation({
    mutationFn: () => requireClient().agents.remove({ id: agent.id }),
  });
  const failure = save.error ?? copy.error ?? remove.error;
  const update = (patch: AgentUpdateInput["patch"]): void => {
    save.mutate(patch);
  };
  const copyTo = (projectId: ProjectId): void => {
    copy.mutate(projectId);
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
        {agent.role === "boss" ? (
          <span className="text-[11px] text-gray-500">runs this floor</span>
        ) : (
          <button
            type="button"
            className="text-[11px] text-red-300 hover:underline"
            onClick={() => {
              if (window.confirm(`Remove ${agent.name}?`)) {
                remove.mutate();
              }
            }}
          >
            remove
          </button>
        )}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
        <ProviderModelFields
          dense
          value={choiceOf(agent)}
          onChange={(next) => {
            update(next);
          }}
        />
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
      {agent.role === "boss" || otherFloors.length === 0 ? null : (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
          copy to floor
          <select
            className="rounded bg-ink px-1"
            value=""
            onChange={(e) => {
              if (e.target.value !== "") {
                copyTo(ProjectId.parse(e.target.value));
              }
            }}
          >
            <option value="">…</option>
            {otherFloors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {failure === null ? null : (
        <p className="mt-1 text-[11px] text-red-400">{errorMessage(failure)}</p>
      )}
    </div>
  );
}

/** The staff of the selected floor: the boss first, then everybody else by name. */
export function AgentsSettings(): React.JSX.Element {
  const snapshot = useUi((s) => s.snapshot);
  const floorId = useUi((s) => s.floorId);
  if (floorId === null) {
    return <p className="text-gray-400">Add a project (floor) first.</p>;
  }
  const agents = [...snapshot.agents.values()]
    .filter((a) => a.projectId === floorId)
    .toSorted(
      (a, b) =>
        Number(b.role === "boss") - Number(a.role === "boss") || a.name.localeCompare(b.name),
    );
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] tracking-wide text-gray-400 uppercase">
        Team of floor {snapshot.projects.get(floorId)?.name ?? ""}
      </h3>
      {agents.map((a) => (
        <AgentRow key={a.id} agent={a} snapshot={snapshot} />
      ))}
      <NewAgent floorId={floorId} />
    </section>
  );
}
