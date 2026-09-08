import type { Agent, AgentId, RepoInspection, RepoSource } from "@ho/protocol";
import { useEffect, useEffectEvent, useState } from "react";
import { getClient } from "../rpc.ts";
import { type Snapshot, sortedFloors, useUi } from "../store.ts";

const INSPECT_DEBOUNCE_MS = 600;

/** A git URL when it looks like one (scheme or scp-style), else a path on this machine. */
const repoOf = (source: string): RepoSource =>
  /^(?:https?:|git@|ssh:|git:|file:)/u.test(source)
    ? { kind: "git", url: source }
    : { kind: "local", path: source };

const describeError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

type Group = { floor: string; agents: Agent[] };

/** Staff of the other floors, grouped by floor, for the import checkboxes (bosses stay with their floor). */
const importable = (snapshot: Snapshot): Group[] =>
  sortedFloors(snapshot)
    .map((p, i) => ({
      floor: `${String(i + 1)} · ${p.name}`,
      agents: [...snapshot.agents.values()].filter(
        (a) => a.projectId === p.id && a.role !== "boss",
      ),
    }))
    .filter((g) => g.agents.length > 0);

type Inspecting = { result: RepoInspection | null; busy: boolean };

/** Asks the daemon about the typed repository once the typing pauses; `onFound` fills in name and branch. */
function useRepoInspection(
  source: string,
  onFound: (result: Extract<RepoInspection, { ok: true }>) => void,
): Inspecting {
  const [state, setState] = useState<Inspecting & { source: string }>({
    source: "",
    result: null,
    busy: false,
  });
  const found = useEffectEvent(onFound);
  useEffect(() => {
    if (source === "") {
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const client = getClient();
      if (client === null) {
        return;
      }
      setState({ source, result: null, busy: true });
      client.projects.inspect({ repo: repoOf(source) }).then(
        (result) => {
          if (!cancelled) {
            setState({ source, result, busy: false });
            if (result.ok) {
              found(result);
            }
          }
        },
        (e: unknown) => {
          if (!cancelled) {
            setState({ source, result: { ok: false, message: describeError(e) }, busy: false });
          }
        },
      );
    }, INSPECT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source]);
  return state.source === source ? state : { result: null, busy: source !== "" };
}

const inspectionText = (source: string, { result, busy }: Inspecting): string => {
  if (source === "" || (result === null && !busy)) {
    return " ";
  }
  if (busy) {
    return "checking with git…";
  }
  return result === null
    ? " "
    : result.ok
      ? `git repository · default branch ${result.defaultBranch}`
      : result.message;
};

function ImportPicker({
  groups,
  imports,
  toggle,
}: {
  groups: Group[];
  imports: ReadonlySet<AgentId>;
  toggle: (id: AgentId) => void;
}): React.JSX.Element | null {
  if (groups.length === 0) {
    return null;
  }
  return (
    <fieldset>
      <legend className="text-gray-400">Import characters from other floors</legend>
      <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded bg-ink p-2">
        {groups.map((g) => (
          <div key={g.floor}>
            <div className="text-[10px] tracking-wide text-gray-500 uppercase">{g.floor}</div>
            {g.agents.map((a) => (
              <label key={a.id} className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={imports.has(a.id)}
                  onChange={() => {
                    toggle(a.id);
                  }}
                />
                <span>{a.name}</span>
                <span className="text-gray-500">
                  {a.role} · {a.model}/{a.effort}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

type Draft = { source: string; name: string; branch: string; imports: Set<AgentId> };
const EMPTY: Draft = { source: "", name: "", branch: "", imports: new Set() };

function NameBranchFields({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="text-gray-400">Floor name</span>
        <input
          className="mt-1 w-full rounded bg-ink px-2 py-1"
          value={draft.name}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
          }}
        />
      </label>
      <label className="block">
        <span className="text-gray-400">Default branch</span>
        <input
          className="mt-1 w-full rounded bg-ink px-2 py-1 font-mono"
          value={draft.branch}
          onChange={(e) => {
            setDraft({ ...draft, branch: e.target.value });
          }}
        />
      </label>
    </div>
  );
}

/**
 * The add-project dialog (D23): a repository path or URL, checked by the daemon (git, name, default branch),
 * optional characters imported from other floors, and Create. The new floor gets its own Andrew and Lola.
 */
export function AddProjectModal(): React.JSX.Element | null {
  const open = useUi((s) => s.addProjectOpen);
  const setOpen = useUi((s) => s.setAddProjectOpen);
  const selectFloor = useUi((s) => s.selectFloor);
  const snapshot = useUi((s) => s.snapshot);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = open ? draft.source.trim() : "";
  const inspecting = useRepoInspection(source, (found) => {
    // Fill what the user has not typed themselves.
    setDraft((d) => ({
      ...d,
      name: d.name === "" ? found.name : d.name,
      branch: d.branch === "" ? found.defaultBranch : d.branch,
    }));
  });
  if (!open) {
    return null;
  }
  const inspection = inspecting.result;
  const close = (): void => {
    setOpen(false);
    setDraft(EMPTY);
    setError(null);
  };
  const canCreate =
    !busy &&
    !inspecting.busy &&
    source !== "" &&
    draft.name.trim() !== "" &&
    inspection?.ok === true;
  const create = async (): Promise<void> => {
    const client = getClient();
    if (client === null || inspection?.ok !== true) {
      return;
    }
    setBusy(true);
    try {
      const project = await client.projects.create({
        name: draft.name.trim(),
        repo: inspection.repo,
        defaultBranch: draft.branch.trim() === "" ? inspection.defaultBranch : draft.branch.trim(),
        importAgentIds: [...draft.imports],
      });
      selectFloor(project.id);
      close();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: AgentId): void => {
    const imports = new Set(draft.imports);
    if (!imports.delete(id)) {
      imports.add(id);
    }
    setDraft({ ...draft, imports });
  };
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 text-xs">
      <div className="w-full max-w-lg space-y-3 rounded-lg border border-line bg-panel p-4 shadow-2xl">
        <header>
          <h2 className="text-base font-semibold">Add a project (floor)</h2>
          <p className="text-gray-400">
            Every project is a floor of the office with its own boss, Andrew, and Lola at the
            reception. Point it at a git repository on this machine or at a git URL.
          </p>
        </header>
        <label className="block">
          <span className="text-gray-400">Repository path or URL</span>
          <input
            className="mt-1 w-full rounded bg-ink px-2 py-1 font-mono"
            placeholder="/Users/you/projects/app or https://github.com/org/repo.git"
            value={draft.source}
            onChange={(e) => {
              setDraft({ ...draft, source: e.target.value, name: "", branch: "" });
            }}
          />
          <span className="mt-1 block text-[11px] text-gray-400">
            {inspectionText(source, inspecting)}
          </span>
        </label>
        <NameBranchFields draft={draft} setDraft={setDraft} />
        <ImportPicker groups={importable(snapshot)} imports={draft.imports} toggle={toggle} />
        {error === null ? null : (
          <p className="rounded bg-red-950/70 px-2 py-1 text-red-200">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded bg-line px-3 py-1" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-accent px-3 py-1 font-semibold text-black disabled:opacity-40"
            disabled={!canCreate}
            onClick={() => {
              void create();
            }}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
