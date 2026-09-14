import { isTerminal, mailForTask } from "@ho/core";
import type { ProjectId, Task, TaskStatus } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, Button, Empty, Failure, Section } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { type Snapshot, useUi } from "../store.ts";
import { Card } from "@/components/ui/card";

const COLUMNS = [
  { status: ["inbox", "planned"], title: "board.inbox", tone: "neutral" },
  { status: ["assigned", "in_progress"], title: "board.inProgress", tone: "accent" },
  { status: ["review"], title: "board.review", tone: "warn" },
  { status: ["blocked"], title: "board.blocked", tone: "bad" },
  { status: ["done", "failed", "cancelled"], title: "board.done", tone: "good" },
] as const satisfies readonly {
  status: readonly TaskStatus[];
  title: string;
  tone: "neutral" | "accent" | "warn" | "bad" | "good";
}[];

const LINK =
  "rounded-md border border-border px-1.5 py-px text-2xs text-foreground/80 hover:border-primary/50 hover:text-primary";

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
    <Card className="animate-rise space-y-2 p-3 text-xs">
      <div className="font-medium">{task.title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={task.priority === "high" ? "warn" : "neutral"}>{task.priority}</Badge>
        {task.kind === "triage" ? <Badge>{t("board.triage")}</Badge> : null}
        {task.reviewRounds > 0 ? (
          <Badge tone="warn">{t("board.rounds", { count: task.reviewRounds })}</Badge>
        ) : null}
        {mail === undefined ? null : (
          <a className={LINK} href={mail.url} target="_blank" rel="noreferrer">
            {t("board.issue", { id: mail.externalId })}
          </a>
        )}
        {task.artifacts.prUrl === undefined ? null : (
          <a className={LINK} href={task.artifacts.prUrl} target="_blank" rel="noreferrer">
            {t("board.pullRequest")}
          </a>
        )}
      </div>
      {assignee === undefined ? null : (
        <button
          type="button"
          className="block text-2xs text-primary hover:underline"
          onClick={() => {
            selectAgent(assignee.id);
          }}
        >
          {assignee.name}
          {reviewer === undefined ? "" : t("board.reviewer", { name: reviewer.name })}
        </button>
      )}
      {task.artifacts.branch === undefined ? null : (
        <div className="truncate font-mono text-2xs text-muted-foreground">
          {task.artifacts.branch}
        </div>
      )}
    </Card>
  );
}

/** Finished work is history, not a queue: this is how it leaves the board without leaving the log. */
function ClearFinished({
  floorId,
  finished,
}: {
  floorId: ProjectId;
  finished: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  const clear = useMutation({
    mutationFn: () => requireClient().tasks.clear({ projectId: floorId }),
  });
  return (
    <span className="flex items-center gap-2">
      <Failure error={clear.error} />
      <Button
        disabled={clear.isPending}
        onClick={() => {
          if (window.confirm(t("board.clearConfirm", { count: finished }))) {
            clear.mutate();
          }
        }}
      >
        {t("board.clear")}
      </Button>
    </span>
  );
}

/** The tasks of the selected floor by status; the picker in the header chooses the floor. */
export function BoardPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const allTasks = useUi((s) => s.snapshot.tasks);
  const agents = useUi((s) => s.snapshot.agents);
  const inbox = useUi((s) => s.snapshot.mail);
  const floorId = useUi((s) => s.floorId);
  const tasks = [...allTasks.values()]
    .filter((task) => task.projectId === floorId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const finished = tasks.filter((task) => isTerminal(task.status)).length;
  return (
    <div className="h-full space-y-6 overflow-y-auto p-4">
      {tasks.length === 0 ? <Empty>{t("board.empty")}</Empty> : null}
      {floorId === null || finished === 0 ? null : (
        <div className="flex justify-end">
          <ClearFinished floorId={floorId} finished={finished} />
        </div>
      )}
      {COLUMNS.map((column) => {
        const items = tasks.filter((task) =>
          column.status.some((status) => status === task.status),
        );
        return items.length === 0 ? null : (
          <Section
            key={column.title}
            title={t(column.title)}
            aside={<Badge tone={column.tone}>{items.length}</Badge>}
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
  );
}
