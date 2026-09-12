import { mailForTask } from "@ho/core";
import type { Task, TaskStatus } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { Section } from "../kit/controls.tsx";
import { type Snapshot, useUi } from "../store.ts";

const COLUMNS = [
  { status: ["inbox", "planned"], title: "board.inbox" },
  { status: ["assigned", "in_progress"], title: "board.inProgress" },
  { status: ["review"], title: "board.review" },
  { status: ["blocked"], title: "board.blocked" },
  { status: ["done", "failed", "cancelled"], title: "board.done" },
] as const satisfies readonly { status: readonly TaskStatus[]; title: string }[];

type CardProps = {
  task: Task;
  agents: Snapshot["agents"];
  tasks: Snapshot["tasks"];
  inbox: Snapshot["mail"];
};

function TaskCard({ task, agents, tasks, inbox }: CardProps): React.JSX.Element {
  const { t } = useTranslation();
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
        {task.kind === "triage" ? <span>{t("board.triage")}</span> : null}
        {mail === undefined ? null : (
          <a
            className="text-sky-300 hover:underline"
            href={mail.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("board.issue", { id: mail.externalId })}
          </a>
        )}
        {task.reviewRounds > 0 ? (
          <span>{t("board.rounds", { count: task.reviewRounds })}</span>
        ) : null}
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
          {reviewer === undefined ? "" : t("board.reviewer", { name: reviewer.name })}
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
          {t("board.pullRequest")}
        </a>
      )}
    </div>
  );
}

/** The tasks of the selected floor by status; the floor tabs in the header pick the project. */
export function BoardPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const projects = useUi((s) => s.snapshot.projects);
  const allTasks = useUi((s) => s.snapshot.tasks);
  const agents = useUi((s) => s.snapshot.agents);
  const inbox = useUi((s) => s.snapshot.mail);
  const floorId = useUi((s) => s.floorId);
  const floor = floorId === null ? undefined : projects.get(floorId);
  const tasks = [...allTasks.values()]
    .filter((task) => task.projectId === floorId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 text-xs">
        <span className="text-gray-400">{t("board.floor")}</span>
        <span>{floor?.name ?? "—"}</span>
        <span className="ml-auto text-gray-400">{t("board.tasks", { count: tasks.length })}</span>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {COLUMNS.map((column) => {
          const items = tasks.filter((task) =>
            column.status.some((status) => status === task.status),
          );
          return (
            <Section
              key={column.title}
              title={t(column.title)}
              aside={<span className="text-2xs text-gray-500">{items.length}</span>}
            >
              <div className="space-y-2">
                {items.slice(0, 30).map((item) => (
                  <TaskCard
                    key={item.id}
                    task={item}
                    agents={agents}
                    tasks={allTasks}
                    inbox={inbox}
                  />
                ))}
              </div>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
