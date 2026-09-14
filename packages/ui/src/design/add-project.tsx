import type { Agent, AgentId } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ROLE_KEY } from "../i18n/labels.ts";
import { Button, Failure } from "./controls.tsx";
import { Modal, Section } from "./modal.tsx";
import { type Client, requireClient } from "../rpc.ts";
import { type Snapshot, sortedFloors, useUi } from "../store.ts";
import { typedIn, useRepoInspection, type RepoDraft } from "./add-project-inspect.ts";
import { Details, RepoFields } from "./add-project-repo.tsx";

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
      <div
        style={{
          maxHeight: "176px",
          overflowY: "auto",
          borderRadius: "11px",
          border: "1px solid #26262C",
          background: "#0A0A0C",
          padding: "12px",
        }}
      >
        {groups.map((g) => (
          <div key={g.floor} style={{ marginBottom: "10px" }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "9.5px",
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "#ABA8A1",
                marginBottom: "6px",
              }}
            >
              {g.floor}
            </div>
            {g.agents.map((a) => (
              <label
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  padding: "4px 0",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={imports.has(a.id)}
                  onChange={() => {
                    toggle(a.id);
                  }}
                  style={{ accentColor: "#FFC531" }}
                />
                <span style={{ fontSize: "12.5px" }}>{a.name}</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: "10px",
                    color: "#A6A39C",
                  }}
                >
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
export function AddProject(): React.JSX.Element | null {
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
          <div style={{ marginRight: "auto" }}>
            <Failure error={create.error} />
          </div>
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button
            tone="primary"
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
