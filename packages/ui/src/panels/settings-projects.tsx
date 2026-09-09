import { errorMessage, type Project } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { Button, Section } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { sortedFloors, useUi } from "../store.ts";
import { IntakeSettings } from "./settings-intake.tsx";

const describeRepo = (p: Project): string => (p.repo.kind === "local" ? p.repo.path : p.repo.url);

/** The floors: one per project, numbered by creation. Adding one goes through the add-project dialog. */
export function ProjectsSettings(): React.JSX.Element {
  const projects = useUi((s) => s.snapshot.projects);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const togglePr = useMutation({
    mutationFn: (p: Project) =>
      requireClient().projects.update({
        id: p.id,
        patch: {
          publish: { ...p.publish, mode: p.publish.mode === "branch" ? "pull-request" : "branch" },
        },
      }),
  });
  const remove = useMutation({
    mutationFn: (p: Project) => requireClient().projects.remove({ id: p.id }),
  });
  const failure = togglePr.error ?? remove.error;
  const confirmRemove = (p: Project): void => {
    if (
      window.confirm(
        `Remove floor ${p.name} with its boss and staff? Tasks and history stay in the log.`,
      )
    ) {
      remove.mutate(p);
    }
  };

  return (
    <Section title="Floors (projects)">
      {sortedFloors(projects).map((p, i) => (
        <div key={p.id} className="space-y-1.5 rounded-md border border-line bg-panel p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              <span className="text-gray-400">{String(i + 1)} · </span>
              {p.name}
            </span>
            <span className="flex gap-3 text-xs">
              <button
                type="button"
                className="text-gray-300 hover:underline"
                onClick={() => {
                  togglePr.mutate(p);
                }}
              >
                delivery: {p.publish.mode}
              </button>
              <button
                type="button"
                className="text-red-300 hover:underline"
                onClick={() => {
                  confirmRemove(p);
                }}
              >
                remove
              </button>
            </span>
          </div>
          <div className="truncate font-mono text-2xs text-gray-400">
            {describeRepo(p)} · {p.defaultBranch}
          </div>
          <IntakeSettings project={p} />
        </div>
      ))}
      <Button
        variant="primary"
        onClick={() => {
          setAddProjectOpen(true);
        }}
      >
        Add a project (floor)
      </Button>
      {failure === null ? null : <span className="ml-3 text-red-400">{errorMessage(failure)}</span>}
    </Section>
  );
}
