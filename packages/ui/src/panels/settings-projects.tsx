import type { Project } from "@ho/protocol";
import { useState } from "react";
import { getClient } from "../rpc.ts";
import { useUi } from "../store.ts";
import { IntakeSettings } from "./settings-intake.tsx";

const describeRepo = (p: Project): string =>
  p.repo.kind === "none" ? "office" : p.repo.kind === "local" ? p.repo.path : p.repo.url;

export function ProjectsSettings(): React.JSX.Element {
  const snapshot = useUi((s) => s.snapshot);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const projects = [...snapshot.projects.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  const fail = (e: unknown): void => {
    setError(e instanceof Error ? e.message : String(e));
  };

  const add = (): void => {
    const client = getClient();
    const trimmed = source.trim();
    if (client === null || trimmed === "" || name.trim() === "") {
      return;
    }
    const repo = /^(?:https?:|git@|ssh:|file:)/u.test(trimmed)
      ? ({ kind: "git", url: trimmed } as const)
      : ({ kind: "local", path: trimmed } as const);
    client.projects.create({ name: name.trim(), repo }).then(() => {
      setName("");
      setSource("");
      setError(null);
    }, fail);
  };

  const togglePr = (p: Project): void => {
    const mode = p.publish.mode === "branch" ? "pull-request" : "branch";
    getClient()
      ?.projects.update({ id: p.id, patch: { publish: { ...p.publish, mode } } })
      .catch(fail);
  };

  const remove = (p: Project): void => {
    if (window.confirm(`Remove project ${p.name}? Tasks and history stay in the log.`)) {
      getClient()?.projects.remove({ id: p.id }).catch(fail);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] tracking-wide text-gray-400 uppercase">Projects</h3>
      {projects.map((p) => (
        <div key={p.id} className="rounded border border-line bg-panel p-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{p.name}</span>
            {p.repo.kind === "none" ? null : (
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
            )}
          </div>
          <div className="truncate font-mono text-[10px] text-gray-400">{describeRepo(p)}</div>
          {p.repo.kind === "none" ? null : <IntakeSettings project={p} />}
        </div>
      ))}
      <div className="rounded border border-dashed border-line p-2">
        <input
          className="mb-1 w-full rounded bg-panel px-2 py-1"
          placeholder="Project name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <input
          className="mb-1 w-full rounded bg-panel px-2 py-1 font-mono"
          placeholder="/path/to/repo or https://github.com/org/repo.git"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
          }}
        />
        <button type="button" className="rounded bg-accent px-2 py-1 text-black" onClick={add}>
          Add project
        </button>
        {error === null ? null : <span className="ml-2 text-red-400">{error}</span>}
      </div>
    </section>
  );
}
