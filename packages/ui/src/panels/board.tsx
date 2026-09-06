import { ProjectId, type Task, type TaskStatus } from "@ho/protocol";
import { useState } from "react";
import { type Snapshot, useUi } from "../store.ts";

const COLUMNS: { status: TaskStatus[]; title: string }[] = [
  { status: ["inbox", "planned"], title: "Inbox" },
  { status: ["assigned", "in_progress"], title: "In progress" },
  { status: ["review"], title: "Review" },
  { status: ["blocked"], title: "Blocked" },
  { status: ["done", "failed", "cancelled"], title: "Done" },
];

function TaskCard({ task, snapshot }: { task: Task; snapshot: Snapshot }): React.JSX.Element {
  const selectAgent = useUi((s) => s.selectAgent);
  const assignee = task.assigneeId === undefined ? undefined : snapshot.agents.get(task.assigneeId);
  const reviewer = task.reviewerId === undefined ? undefined : snapshot.agents.get(task.reviewerId);
  return (
    <div className="rounded border border-line bg-panel p-2 text-xs">
      <div className="font-medium">{task.title}</div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-gray-400">
        <span>{task.status}</span>
        <span>{task.priority}</span>
        {task.kind === "triage" ? <span>triage</span> : null}
        {task.reviewRounds > 0 ? <span>rounds {task.reviewRounds}</span> : null}
      </div>
      {assignee === undefined ? null : (
        <button
          type="button"
          className="mt-1 text-accent hover:underline"
          onClick={() => {
            selectAgent(assignee.id);
          }}
        >
          {assignee.name}
          {reviewer === undefined ? "" : ` → ${reviewer.name}`}
        </button>
      )}
      {task.artifacts.branch === undefined ? null : (
        <div className="mt-1 truncate font-mono text-[10px] text-gray-300">
          {task.artifacts.branch}
        </div>
      )}
      {task.artifacts.prUrl === undefined ? null : (
        <a
          className="text-[10px] text-sky-300 hover:underline"
          href={task.artifacts.prUrl}
          target="_blank"
          rel="noreferrer"
        >
          pull request
        </a>
      )}
    </div>
  );
}

export function BoardPanel(): React.JSX.Element {
  const snapshot = useUi((s) => s.snapshot);
  const [projectId, setProjectId] = useState<ProjectId | "all">("all");
  const projects = [...snapshot.projects.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  const tasks = [...snapshot.tasks.values()]
    .filter((t) => projectId === "all" || t.projectId === projectId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line p-2 text-xs">
        <span className="text-gray-400">Project</span>
        <select
          className="rounded bg-panel px-1 py-0.5"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value === "all" ? "all" : ProjectId.parse(e.target.value));
          }}
        >
          <option value="all">All</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-gray-400">{tasks.length} tasks</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-2">
        {COLUMNS.map((column) => {
          const items = tasks.filter((t) => column.status.includes(t.status));
          return (
            <section key={column.title}>
              <h3 className="mb-1 text-[11px] tracking-wide text-gray-400 uppercase">
                {column.title} · {items.length}
              </h3>
              <div className="space-y-1">
                {items.slice(0, 30).map((t) => (
                  <TaskCard key={t.id} task={t} snapshot={snapshot} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
