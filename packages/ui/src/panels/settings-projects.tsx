import { errorMessage, type Project } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
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
    <section className="space-y-2">
      <h3 className="text-[11px] tracking-wide text-gray-400 uppercase">Floors (projects)</h3>
      {sortedFloors(projects).map((p, i) => (
        <div key={p.id} className="rounded border border-line bg-panel p-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              <span className="text-gray-400">{String(i + 1)} · </span>
              {p.name}
            </span>
            <span className="flex gap-2 text-[11px]">
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
          <div className="truncate font-mono text-[10px] text-gray-400">
            {describeRepo(p)} · {p.defaultBranch}
          </div>
          <IntakeSettings project={p} />
        </div>
      ))}
      <button
        type="button"
        className="rounded bg-accent px-2 py-1 text-black"
        onClick={() => {
          setAddProjectOpen(true);
        }}
      >
        Add a project (floor)
      </button>
      {failure === null ? null : <span className="ml-2 text-red-400">{errorMessage(failure)}</span>}
    </section>
  );
}
