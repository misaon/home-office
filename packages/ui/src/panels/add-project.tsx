import { type Agent, type AgentId, errorMessage } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Section } from "../kit/controls.tsx";
import { Modal } from "../kit/modal.tsx";
import { type Client, requireClient } from "../rpc.ts";
import { type Snapshot, sortedFloors, useUi } from "../store.ts";
import {
  type Draft,
  Details,
  RepoFields,
  typedIn,
  useRepoInspection,
} from "./add-project-repo.tsx";

const EMPTY: Draft = { kind: "local", path: "", url: "", name: "", branch: "", imports: new Set() };

type Group = { floor: string; agents: Agent[] };

/** Staff of the other floors, grouped by floor, for the import checkboxes (bosses stay with their floor). */
const importable = (projects: Snapshot["projects"], agents: Snapshot["agents"]): Group[] =>
  sortedFloors(projects)
    .map((p, i) => ({
      floor: `${String(i + 1)} · ${p.name}`,
      agents: [...agents.values()].filter((a) => a.projectId === p.id && a.role !== "boss"),
    }))
    .filter((g) => g.agents.length > 0);

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
    <Section title="Import characters from other floors">
      <div className="max-h-44 space-y-3 overflow-y-auto rounded-md border border-line bg-ink p-3">
        {groups.map((g) => (
          <div key={g.floor} className="space-y-1">
            <div className="text-2xs tracking-widest text-gray-500 uppercase">{g.floor}</div>
            {g.agents.map((a) => (
              <label key={a.id} className="flex items-center gap-2.5 py-1">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={imports.has(a.id)}
                  onChange={() => {
                    toggle(a.id);
                  }}
                />
                <span className="text-xs">{a.name}</span>
                <span className="text-2xs text-gray-500">
                  {a.role} · {a.model}/{a.effort}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * The add-project dialog (D23): a folder chosen on this machine or a git URL, checked by the daemon
 * (git, name, branches), optional characters imported from other floors, and Create. The new floor
 * gets its own Andrew and Lola.
 */
export function AddProjectModal(): React.JSX.Element | null {
  const open = useUi((s) => s.addProjectOpen);
  const setOpen = useUi((s) => s.setAddProjectOpen);
  const selectFloor = useUi((s) => s.selectFloor);
  const projects = useUi((s) => s.snapshot.projects);
  const agents = useUi((s) => s.snapshot.agents);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const create = useMutation({
    mutationFn: (input: Parameters<Client["projects"]["create"]>[0]) =>
      requireClient().projects.create(input),
    onSuccess: (project) => {
      selectFloor(project.id);
      setOpen(false);
      setDraft(EMPTY);
    },
  });
  const inspecting = useRepoInspection(draft.kind, open ? typedIn(draft) : "", (found) => {
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
    create.reset();
  };
  const canCreate =
    !create.isPending && !inspecting.busy && draft.name.trim() !== "" && inspection?.ok === true;
  const submit = (): void => {
    if (inspection?.ok === true) {
      create.mutate({
        name: draft.name.trim(),
        repo: inspection.repo,
        defaultBranch: draft.branch === "" ? inspection.defaultBranch : draft.branch,
        importAgentIds: [...draft.imports],
      });
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
    <Modal
      title="Add a project (floor)"
      description="Every project is a floor of the office with its own boss, Andrew, and Lola at the reception. Point it at a git repository on this machine or at a git URL."
      onClose={close}
      footer={
        <>
          {create.error === null ? null : (
            <p className="mr-auto text-xs text-red-300">{errorMessage(create.error)}</p>
          )}
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!canCreate} onClick={submit}>
            {create.isPending ? "Creating…" : "Create floor"}
          </Button>
        </>
      }
    >
      <Section title="Repository">
        <RepoFields draft={draft} setDraft={setDraft} inspecting={inspecting} />
      </Section>
      <Details
        draft={draft}
        setDraft={setDraft}
        branches={inspection?.ok === true ? inspection.branches : []}
      />
      <ImportPicker groups={importable(projects, agents)} imports={draft.imports} toggle={toggle} />
    </Modal>
  );
}
