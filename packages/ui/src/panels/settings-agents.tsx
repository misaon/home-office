import { type Agent, type AgentUpdateInput, Gender, type Project, ProjectId } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { GENDER_KEY, ROLE_KEY } from "../i18n/labels.ts";
import { CONTROL, Failure, Field, Section } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { sortedFloors, useUi } from "../store.ts";
import { type Choice, ProviderModelFields } from "./agent-fields.tsx";
import { NewAgent } from "./agent-new.tsx";

const choiceOf = (agent: Agent): Choice => ({
  provider: agent.provider,
  auth: agent.auth,
  model: agent.model,
  effort: agent.effort,
});

type RowProps = { agent: Agent; projects: ReadonlyMap<ProjectId, Project> };

function AgentRow({ agent, projects }: RowProps): React.JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const otherFloors = sortedFloors(projects).filter((p) => p.id !== agent.projectId);
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
  return (
    <div className="space-y-2.5 rounded-md border border-line bg-panel p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {agent.name} <span className="text-gray-400">· {t(ROLE_KEY[agent.role])}</span>
        </span>
        {agent.role === "boss" ? (
          <span className="text-xs text-gray-500">{t("agent.runsFloor")}</span>
        ) : (
          <button
            type="button"
            className="text-xs text-red-300 hover:underline"
            onClick={() => {
              if (window.confirm(t("agent.confirmRemove", { name: agent.name }))) {
                remove.mutate();
              }
            }}
          >
            {t("common.remove")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
        <ProviderModelFields
          role={agent.role}
          value={choiceOf(agent)}
          onChange={(next) => {
            save.mutate(next);
          }}
        />
        <Field id={`${id}-gender`} label={t("agent.gender")}>
          <select
            id={`${id}-gender`}
            className={CONTROL}
            value={agent.appearance.gender}
            onChange={(e) => {
              save.mutate({ appearance: { gender: Gender.parse(e.target.value) } });
            }}
          >
            {Gender.options.map((gender) => (
              <option key={gender} value={gender}>
                {t(GENDER_KEY[gender])}
              </option>
            ))}
          </select>
        </Field>
        {agent.role === "boss" || otherFloors.length === 0 ? null : (
          <Field id={`${id}-copy`} label={t("agent.copyToFloor")}>
            <select
              id={`${id}-copy`}
              className={CONTROL}
              value=""
              onChange={(e) => {
                if (e.target.value !== "") {
                  copy.mutate(ProjectId.parse(e.target.value));
                }
              }}
            >
              <option value="">{t("agent.pickFloor")}</option>
              {otherFloors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Failure error={save.error ?? copy.error ?? remove.error} />
    </div>
  );
}

/** The staff of the selected floor: the boss first, then everybody else by name. */
export function AgentsSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const projects = useUi((s) => s.snapshot.projects);
  const staff = useUi((s) => s.snapshot.agents);
  const floorId = useUi((s) => s.floorId);
  if (floorId === null) {
    return <p className="text-gray-400">{t("project.needFirst")}</p>;
  }
  const agents = [...staff.values()]
    .filter((a) => a.projectId === floorId)
    .toSorted(
      (a, b) =>
        Number(b.role === "boss") - Number(a.role === "boss") || a.name.localeCompare(b.name),
    );
  return (
    <Section title={t("agent.team", { floor: projects.get(floorId)?.name ?? "" })}>
      {agents.map((a) => (
        <AgentRow key={a.id} agent={a} projects={projects} />
      ))}
      <NewAgent floorId={floorId} />
    </Section>
  );
}
