import { mailForTask } from "@ho/core";
import type { Task, TaskStatus } from "@ho/protocol";
import { Section } from "../kit/controls.tsx";
import { type Snapshot, useUi } from "../store.ts";

const COLUMNS: { status: TaskStatus[]; title: string }[] = [
  { status: ["inbox", "planned"], title: "Inbox" },
  { status: ["assigned", "in_progress"], title: "In progress" },
  { status: ["review"], title: "Review" },
  { status: ["blocked"], title: "Blocked" },
  { status: ["done", "failed", "cancelled"], title: "Done" },
];

type CardProps = {
  task: Task;
  agents: Snapshot["agents"];
  tasks: Snapshot["tasks"];
  inbox: Snapshot["mail"];
};

function TaskCard({ task, agents, tasks, inbox }: CardProps): React.JSX.Element {
  const selectAgent = useUi((s) => s.selectAgent);
  const assignee = task.assigneeId === undefined ? undefined : agents.get(task.assigneeId);
  const reviewer = task.reviewerId === undefined ? undefined : agents.get(task.reviewerId);
  const mail = mailForTask({ tasks, mail: inbox }, task);
  return (
    <div className="rounded-md border border-line bg-panel p-3 text-xs">
      <div className="font-medium">{task.title}</div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-gray-400">
        <span>{task.status}</span>
        <span>{task.priority}</span>
        {task.kind === "triage" ? <span>triage</span> : null}
        {mail === undefined ? null : (
          <a
            className="text-sky-300 hover:underline"
            href={mail.url}
            target="_blank"
            rel="noreferrer"
          >
            issue #{mail.externalId}
          </a>
        )}
        {task.reviewRounds > 0 ? <span>rounds {task.reviewRounds}</span> : null}
      </div>
      {assignee === undefined ? null : (
        <button
          type="button"
          className="mt-2 block text-accent hover:underline"
          onClick={() => {
            selectAgent(assignee.id);
          }}
        >
          {assignee.name}
          {reviewer === undefined ? "" : ` → ${reviewer.name}`}
        </button>
      )}
      {task.artifacts.branch === undefined ? null : (
        <div className="mt-2 truncate font-mono text-2xs text-gray-300">
          {task.artifacts.branch}
        </div>
      )}
      {task.artifacts.prUrl === undefined ? null : (
        <a
          className="text-2xs text-sky-300 hover:underline"
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

/** The tasks of the selected floor by status; the floor tabs in the header pick the project. */
export function BoardPanel(): React.JSX.Element {
  const projects = useUi((s) => s.snapshot.projects);
  const allTasks = useUi((s) => s.snapshot.tasks);
  const agents = useUi((s) => s.snapshot.agents);
  const inbox = useUi((s) => s.snapshot.mail);
  const floorId = useUi((s) => s.floorId);
  const floor = floorId === null ? undefined : projects.get(floorId);
  const tasks = [...allTasks.values()]
    .filter((t) => t.projectId === floorId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 text-xs">
        <span className="text-gray-400">Floor</span>
        <span>{floor?.name ?? "—"}</span>
        <span className="ml-auto text-gray-400">{tasks.length} tasks</span>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {COLUMNS.map((column) => {
          const items = tasks.filter((t) => column.status.includes(t.status));
          return (
            <Section
              key={column.title}
              title={column.title}
              aside={<span className="text-2xs text-gray-500">{items.length}</span>}
            >
              <div className="space-y-2">
                {items.slice(0, 30).map((t) => (
                  <TaskCard key={t.id} task={t} agents={agents} tasks={allTasks} inbox={inbox} />
                ))}
              </div>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
