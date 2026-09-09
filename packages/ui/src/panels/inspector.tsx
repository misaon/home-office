import { isSessionActive } from "@ho/core";
import type { LiveEvent, Session, Usage } from "@ho/protocol";
import { type Snapshot, useUi } from "../store.ts";

const fmt = (n: number): string => n.toLocaleString();
const usageLine = (u: Usage): string =>
  `${fmt(u.inputTokens)} in · ${fmt(u.outputTokens)} out · ${fmt(u.cacheReadTokens)} cache · ${String(u.turns)} turns`;

function describe(live: LiveEvent): string {
  const e = live.event;
  if (e.kind === "init") {
    return `session ${e.runtimeSessionId.slice(0, 8)} on ${e.model}`;
  }
  if (e.kind === "text_delta") {
    return e.text.trim();
  }
  if (e.kind === "tool_call") {
    return `→ ${e.name}`;
  }
  if (e.kind === "tool_result") {
    return `${e.ok ? "✓" : "✗"} ${e.summary}`;
  }
  if (e.kind === "permission_request") {
    return `permission: ${e.tool}`;
  }
  if (e.kind === "usage") {
    return "";
  }
  if (e.kind === "context") {
    const share =
      e.windowTokens === 0
        ? ""
        : ` (${String(Math.round((e.usedTokens / e.windowTokens) * 100))}%)`;
    const cost = e.cost === null ? "" : ` · ${e.cost.amount.toFixed(2)} ${e.cost.currency}`;
    return `context ${fmt(e.usedTokens)}/${fmt(e.windowTokens)}${share}${cost}`;
  }
  if (e.kind === "rate_limited") {
    return "rate limited";
  }
  if (e.kind === "result") {
    return `${e.ok ? "done" : "failed"}: ${e.text.slice(0, 300)}`;
  }
  return `error ${e.code}: ${e.message}`;
}

function SessionBlock({
  session,
  tasks,
}: {
  session: Session;
  tasks: Snapshot["tasks"];
}): React.JSX.Element {
  const live = useUi((s) => s.live.get(session.id));
  const task = tasks.get(session.taskId);
  const events = (live ?? []).filter((l) => l.event.kind !== "usage").slice(-60);
  return (
    <section className="space-y-1.5 rounded-md border border-line bg-panel p-3 text-xs">
      <div className="flex justify-between gap-3">
        <span className="font-medium">
          {session.mode} · {task?.title ?? session.taskId}
        </span>
        <span className={isSessionActive(session.state) ? "text-emerald-300" : "text-gray-400"}>
          {session.state}
        </span>
      </div>
      <div className="text-gray-400">{usageLine(session.usage)}</div>
      {task?.artifacts.branch === undefined ? null : (
        <div className="truncate font-mono text-2xs text-gray-300">{task.artifacts.branch}</div>
      )}
      {events.length === 0 ? null : (
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-2xs">
          {events.map((l, i) => {
            const text = describe(l);
            return text === "" ? null : (
              <li key={`${l.at}-${String(i)}`} className="truncate text-gray-300">
                <span className="text-gray-500">{new Date(l.at).toLocaleTimeString()} </span>
                {text}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function InspectorPanel(): React.JSX.Element {
  const projects = useUi((s) => s.snapshot.projects);
  const staff = useUi((s) => s.snapshot.agents);
  const tasks = useUi((s) => s.snapshot.tasks);
  const allSessions = useUi((s) => s.snapshot.sessions);
  const floorId = useUi((s) => s.floorId);
  const selected = useUi((s) => s.selectedAgentId);
  const selectAgent = useUi((s) => s.selectAgent);
  const agent = selected === null ? undefined : staff.get(selected);
  const agents = [...staff.values()]
    .filter((a) => a.projectId === floorId)
    .toSorted((a, b) => a.name.localeCompare(b.name));
  if (agent === undefined) {
    return (
      <div className="p-4 text-xs">
        <p className="mb-3 text-gray-400">Click a character in the office or pick an agent:</p>
        <ul className="space-y-2">
          {agents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => {
                  selectAgent(a.id);
                }}
              >
                {a.name}
              </button>{" "}
              <span className="text-gray-400">
                {a.role} · {a.model}/{a.effort}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const sessions = [...allSessions.values()]
    .filter((s) => s.agentId === agent.id)
    .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8);
  const floor = projects.get(agent.projectId)?.name ?? agent.projectId;
  return (
    <div className="space-y-4 overflow-y-auto p-4 text-xs">
      <div className="space-y-1">
        <div className="text-base font-semibold">{agent.name}</div>
        <div className="text-gray-400">
          {agent.role} · {agent.provider} · {agent.model} / {agent.effort} · skills{" "}
          {agent.skillPack}
        </div>
        <div className="text-gray-400">floor: {floor}</div>
        {agent.basePrompt === "" ? null : (
          <p className="mt-2 whitespace-pre-wrap text-gray-300">{agent.basePrompt}</p>
        )}
      </div>
      {sessions.length === 0 ? <p className="text-gray-400">No sessions yet.</p> : null}
      {sessions.map((s) => (
        <SessionBlock key={s.id} session={s} tasks={tasks} />
      ))}
    </div>
  );
}
