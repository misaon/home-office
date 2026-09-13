import type { Agent, AgentId } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ROLE_KEY } from "../i18n/labels.ts";
import { Button, Failure, Section } from "../kit/controls.tsx";
import { Modal } from "../kit/modal.tsx";
import { type Client, requireClient } from "../rpc.ts";
import { type Snapshot, sortedFloors, useUi } from "../store.ts";
import {
  Details,
  type RepoDraft,
  RepoFields,
  typedIn,
  useRepoInspection,
} from "./add-project-repo.tsx";

const EMPTY: RepoDraft = {
  kind: "local",
  path: "",
  url: "",
  name: "",
  branch: "",
  imports: new Set(),
};

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
  const { t } = useTranslation();
  if (groups.length === 0) {
    return null;
  }
  return (
    <Section title={t("project.importAgents")}>
      <div className="max-h-44 space-y-3 overflow-y-auto rounded-md border border-line bg-ink p-3">
        {groups.map((g) => (
          <div key={g.floor} className="space-y-1">
            <div className="text-2xs tracking-widest text-faint uppercase">{g.floor}</div>
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
                <span className="text-2xs text-faint">
                  {t(ROLE_KEY[a.role])} · {a.model}/{a.effort}
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
export function AddProjectModal(): React.JSX.Element {
  const { t } = useTranslation();
  const open = useUi((s) => s.addProjectOpen);
  const setOpen = useUi((s) => s.setAddProjectOpen);
  const selectFloor = useUi((s) => s.selectFloor);
  const projects = useUi((s) => s.snapshot.projects);
  const agents = useUi((s) => s.snapshot.agents);
  const [draft, setDraft] = useState<RepoDraft>(EMPTY);
  const create = useMutation({
    mutationFn: (input: Parameters<Client["projects"]["create"]>[0]) =>
      requireClient().projects.create(input),
    onSuccess: (project) => {
      selectFloor(project.id);
      setOpen(false);
      setDraft(EMPTY);
    },
  });
  const inspecting = useRepoInspection(draft.kind, open ? typedIn(draft) : "");
  const inspection = inspecting.result?.ok === true ? inspecting.result : null;
  const typedName = draft.name.trim();
  const name = typedName === "" ? (inspection?.name ?? "") : typedName;
  const close = (): void => {
    setOpen(false);
    setDraft(EMPTY);
    create.reset();
  };
  const submit = (): void => {
    if (inspection !== null && name !== "") {
      create.mutate({
        name,
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
      open={open}
      title={t("project.add")}
      description={t("project.addDescription")}
      onClose={close}
      footer={
        <>
          <div className="mr-auto">
            <Failure error={create.error} />
          </div>
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button
            variant="primary"
            disabled={create.isPending || inspecting.busy || inspection === null || name === ""}
            onClick={submit}
          >
            {create.isPending ? t("project.creating") : t("project.create")}
          </Button>
        </>
      }
    >
      <Section title={t("project.repository")}>
        <RepoFields draft={draft} setDraft={setDraft} inspecting={inspecting} />
      </Section>
      <Details draft={draft} setDraft={setDraft} inspection={inspection} />
      <ImportPicker groups={importable(projects, agents)} imports={draft.imports} toggle={toggle} />
    </Modal>
  );
}
