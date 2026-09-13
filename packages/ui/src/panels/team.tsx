import {
  type Agent,
  type AgentId,
  type AgentUpdateInput,
  Gender,
  isSessionActive,
  type Project,
  ProjectId,
  type Session,
} from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { GENDER_KEY, ROLE_KEY } from "../i18n/labels.ts";
import {
  Badge,
  Button,
  CARD_LIFT,
  CONTROL,
  Empty,
  Failure,
  Field,
  Section,
} from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { type Snapshot, sortedFloors, useUi } from "../store.ts";
import { type Choice, ProviderModelFields } from "./agent-fields.tsx";
import { NewAgent } from "./agent-new.tsx";
import { SessionBlock } from "./team-sessions.tsx";

const choiceOf = (agent: Agent): Choice => ({
  provider: agent.provider,
  auth: agent.auth,
  model: agent.model,
  effort: agent.effort,
});

/** Everything about one colleague that can be changed, opened from their card. */
function AgentSettings({
  agent,
  projects,
}: {
  agent: Agent;
  projects: ReadonlyMap<ProjectId, Project>;
}): React.JSX.Element {
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
    <div className="animate-rise space-y-4 border-t border-line pt-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
        {otherFloors.length === 0 || agent.role === "boss" ? null : (
          <Field id={`${id}-copy`} label={t("agent.copyToFloor")} hint={t("agent.copyHint")}>
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
      {agent.basePrompt.trim() === "" ? null : (
        <p className="rounded-lg bg-ink/40 p-3 text-2xs leading-relaxed whitespace-pre-wrap text-muted">
          {agent.basePrompt}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <Failure error={save.error ?? copy.error ?? remove.error} />
        {agent.role === "boss" ? (
          <span className="ml-auto text-2xs text-faint">{t("agent.runsFloor")}</span>
        ) : (
          <span className="ml-auto">
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(t("agent.confirmRemove", { name: agent.name }))) {
                  remove.mutate();
                }
              }}
            >
              {t("common.remove")}
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}

/** A colleague: who they are and what they are doing, with everything about them one click deeper. */
function AgentCard({
  agent,
  sessions,
  tasks,
  projects,
}: {
  agent: Agent;
  sessions: Session[];
  tasks: Snapshot["tasks"];
  projects: ReadonlyMap<ProjectId, Project>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const selected = useUi((s) => s.selectedAgentId);
  const selectAgent = useUi((s) => s.selectAgent);
  const [editing, setEditing] = useState(false);
  const open = selected === agent.id;
  const working = sessions.some((s) => isSessionActive(s.state));
  return (
    <div className={`${CARD_LIFT} p-4 ${open ? "border-accent/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
          onClick={() => {
            selectAgent(open ? null : agent.id);
          }}
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{agent.name}</span>
            <Badge tone={agent.role === "boss" ? "accent" : "neutral"}>
              {t(ROLE_KEY[agent.role])}
            </Badge>
            {working ? <Badge tone="good">{t("team.working")}</Badge> : null}
          </span>
          <span className="mt-1 block truncate font-mono text-2xs text-faint">
            {agent.provider} · {agent.model} / {agent.effort}
          </span>
        </button>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2 py-1 text-2xs text-muted hover:bg-line/40 hover:text-text"
          aria-pressed={editing}
          onClick={() => {
            setEditing((current) => !current);
          }}
        >
          {editing ? t("common.close") : t("team.configure")}
        </button>
      </div>
      {editing ? <AgentSettings agent={agent} projects={projects} /> : null}
      {open && !editing ? (
        <div className="mt-3 space-y-2">
          {sessions.length === 0 ? (
            <p className="text-2xs text-faint">{t("session.noSessions")}</p>
          ) : (
            sessions.slice(0, 6).map((s) => <SessionBlock key={s.id} session={s} tasks={tasks} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

/** The floor's people: the boss first, then everybody else by name. */
export function TeamPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [hiring, setHiring] = useState(false);
  const projects = useUi((s) => s.snapshot.projects);
  const staff = useUi((s) => s.snapshot.agents);
  const allSessions = useUi((s) => s.snapshot.sessions);
  const tasks = useUi((s) => s.snapshot.tasks);
  const floorId = useUi((s) => s.floorId);
  if (floorId === null) {
    return (
      <div className="p-4">
        <Empty>{t("project.needFirst")}</Empty>
      </div>
    );
  }
  const agents = [...staff.values()]
    .filter((a) => a.projectId === floorId)
    .toSorted(
      (a, b) =>
        Number(b.role === "boss") - Number(a.role === "boss") || a.name.localeCompare(b.name),
    );
  const sessionsOf = (agentId: AgentId): Session[] =>
    [...allSessions.values()]
      .filter((s) => s.agentId === agentId)
      .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <div className="h-full space-y-5 overflow-y-auto p-4">
      <p className="text-2xs leading-relaxed text-faint">{t("team.intro")}</p>
      <Section
        title={t("team.onFloor", { floor: projects.get(floorId)?.name ?? "" })}
        aside={<Badge>{agents.length}</Badge>}
      >
        <div className="space-y-3">
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              sessions={sessionsOf(a.id)}
              tasks={tasks}
              projects={projects}
            />
          ))}
        </div>
      </Section>
      {hiring ? (
        <Section
          title={t("agent.add")}
          aside={
            <Button
              variant="ghost"
              onClick={() => {
                setHiring(false);
              }}
            >
              {t("common.cancel")}
            </Button>
          }
        >
          <div className="animate-rise">
            <NewAgent
              floorId={floorId}
              onAdded={() => {
                setHiring(false);
              }}
            />
          </div>
        </Section>
      ) : (
        <Button
          variant="primary"
          onClick={() => {
            setHiring(true);
          }}
        >
          {t("agent.add")}
        </Button>
      )}
    </div>
  );
}
