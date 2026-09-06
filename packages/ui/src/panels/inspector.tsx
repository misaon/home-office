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
  snapshot,
}: {
  session: Session;
  snapshot: Snapshot;
}): React.JSX.Element {
  const live = useUi((s) => s.live.get(session.id));
  const task = snapshot.tasks.get(session.taskId);
  const events = (live ?? []).filter((l) => l.event.kind !== "usage").slice(-60);
  return (
    <section className="rounded border border-line bg-panel p-2 text-xs">
      <div className="flex justify-between">
        <span className="font-medium">
          {session.mode} · {task?.title ?? session.taskId}
        </span>
        <span className={isSessionActive(session.state) ? "text-emerald-300" : "text-gray-400"}>
          {session.state}
        </span>
      </div>
      <div className="text-gray-400">{usageLine(session.usage)}</div>
      {task?.artifacts.branch === undefined ? null : (
        <div className="truncate font-mono text-[10px] text-gray-300">{task.artifacts.branch}</div>
      )}
      {events.length === 0 ? null : (
        <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto font-mono text-[10px]">
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
  const snapshot = useUi((s) => s.snapshot);
  const selected = useUi((s) => s.selectedAgentId);
  const selectAgent = useUi((s) => s.selectAgent);
  const agent = selected === null ? undefined : snapshot.agents.get(selected);
  const agents = [...snapshot.agents.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  if (agent === undefined) {
    return (
      <div className="p-3 text-xs">
        <p className="mb-2 text-gray-400">Click a character in the office or pick an agent:</p>
        <ul className="space-y-1">
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
  const sessions = [...snapshot.sessions.values()]
    .filter((s) => s.agentId === agent.id)
    .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8);
  const projects = agent.projectIds.map((id) => snapshot.projects.get(id)?.name ?? id);
  return (
    <div className="space-y-2 overflow-y-auto p-3 text-xs">
      <div>
        <div className="text-base font-semibold">{agent.name}</div>
        <div className="text-gray-400">
          {agent.role} · {agent.provider} · {agent.model} / {agent.effort} · skills{" "}
          {agent.skillPack}
        </div>
        <div className="text-gray-400">projects: {projects.join(", ") || "none"}</div>
        {agent.basePrompt === "" ? null : (
          <p className="mt-1 whitespace-pre-wrap text-gray-300">{agent.basePrompt}</p>
        )}
      </div>
      {sessions.length === 0 ? <p className="text-gray-400">No sessions yet.</p> : null}
      {sessions.map((s) => (
        <SessionBlock key={s.id} session={s} snapshot={snapshot} />
      ))}
    </div>
  );
}
