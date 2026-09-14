import type { Agent, AgentId } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import type { RepoDraft } from "./add-project-inspect.ts";
import { CAP } from "./dialog-sheet.tsx";
import { ROLE_KEY } from "../i18n/labels.ts";
import { type Snapshot, sortedFloors, useUi } from "../store.ts";
import { MONO } from "./tokens.ts";

/**
 * Characters already working on other floors, offered to the new one. The drawing has no such block —
 * it was drawn against an office with a single floor — so this only appears once there is somebody to
 * import, which is exactly when the drawn dialog has nothing to say.
 */

type Group = { floor: string; agents: Agent[] };

const groupsOf = (projects: Snapshot["projects"], agents: Snapshot["agents"]): Group[] =>
  sortedFloors(projects)
    .map((p, i) => ({
      floor: `${String(i + 1)} · ${p.name}`,
      agents: [...agents.values()].filter((a) => a.projectId === p.id && a.role !== "boss"),
    }))
    .filter((g) => g.agents.length > 0);

export function FloorImports({
  draft,
  setDraft,
}: {
  draft: RepoDraft;
  setDraft: (draft: RepoDraft) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const projects = useUi((s) => s.snapshot.projects);
  const agents = useUi((s) => s.snapshot.agents);
  const groups = groupsOf(projects, agents);
  if (groups.length === 0) {
    return null;
  }
  const toggle = (id: AgentId): void => {
    const imports = new Set(draft.imports);
    if (!imports.delete(id)) {
      imports.add(id);
    }
    setDraft({ ...draft, imports });
  };
  return (
    <div style={{ marginTop: "18px" }}>
      <div style={{ ...CAP, marginBottom: "10px" }}>{t("project.importAgents")}</div>
      <div
        style={{
          maxHeight: "176px",
          overflowY: "auto",
          borderRadius: "13px",
          border: "1px solid #232328",
          background: "#101013",
          padding: "13px 14px",
        }}
      >
        {groups.map((group) => (
          <div key={group.floor} style={{ marginBottom: "10px" }}>
            <div style={{ ...CAP, fontSize: "9px", marginBottom: "6px" }}>{group.floor}</div>
            {group.agents.map((agent) => (
              <label
                key={agent.id}
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
                  checked={draft.imports.has(agent.id)}
                  onChange={() => {
                    toggle(agent.id);
                  }}
                  style={{ accentColor: "#FFC531" }}
                />
                <span style={{ fontSize: "12.5px" }}>{agent.name}</span>
                <span style={{ ...MONO, fontSize: "10px", color: "#A6A39C" }}>
                  {t(ROLE_KEY[agent.role])} · {agent.model}/{agent.effort}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
