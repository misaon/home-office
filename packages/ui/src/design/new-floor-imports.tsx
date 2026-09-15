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
    <div className="mt-18">
      <div className={`${CAP} text-9h mb-10`}>{t("project.importAgents")}</div>
      <div className="max-h-176 overflow-y-auto rounded-13 border border-edge bg-card py-13 px-14">
        {groups.map((group) => (
          <div key={group.floor} className="mb-10">
            <div className={`${CAP} text-9 mb-6`}>{group.floor}</div>
            {group.agents.map((agent) => (
              <label key={agent.id} className="flex items-center gap-9 py-4 px-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.imports.has(agent.id)}
                  onChange={() => {
                    toggle(agent.id);
                  }}
                  className="accent-accent my-3 ml-4 mr-3"
                />
                <span className="text-12h">{agent.name}</span>
                <span className={`${MONO} text-10 text-ink-meta`}>
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
