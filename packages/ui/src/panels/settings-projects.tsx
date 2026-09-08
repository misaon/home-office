import { errorMessage, type Project } from "@ho/protocol";
import { useState } from "react";
import { getClient } from "../rpc.ts";
import { sortedFloors, useUi } from "../store.ts";
import { IntakeSettings } from "./settings-intake.tsx";

const describeRepo = (p: Project): string => (p.repo.kind === "local" ? p.repo.path : p.repo.url);

/** The floors: one per project, numbered by creation. Adding one goes through the add-project dialog. */
export function ProjectsSettings(): React.JSX.Element {
  const snapshot = useUi((s) => s.snapshot);
  const setAddProjectOpen = useUi((s) => s.setAddProjectOpen);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown): void => {
    setError(errorMessage(e));
  };

  const togglePr = (p: Project): void => {
    const mode = p.publish.mode === "branch" ? "pull-request" : "branch";
    getClient()
      ?.projects.update({ id: p.id, patch: { publish: { ...p.publish, mode } } })
      .catch(fail);
  };

  const remove = (p: Project): void => {
    if (
      window.confirm(
        `Remove floor ${p.name} with its boss and staff? Tasks and history stay in the log.`,
      )
    ) {
      getClient()?.projects.remove({ id: p.id }).catch(fail);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] tracking-wide text-gray-400 uppercase">Floors (projects)</h3>
      {sortedFloors(snapshot).map((p, i) => (
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
                  togglePr(p);
                }}
              >
                delivery: {p.publish.mode}
              </button>
              <button
                type="button"
                className="text-red-300 hover:underline"
                onClick={() => {
                  remove(p);
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
      {error === null ? null : <span className="ml-2 text-red-400">{error}</span>}
    </section>
  );
}
