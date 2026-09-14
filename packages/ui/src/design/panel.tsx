import { Board } from "./board.tsx";
import { Chat } from "./chat.tsx";
import { AgentSheet } from "./sheet-agent.tsx";
import { Settings } from "./settings.tsx";
import { TaskSheet } from "./sheet-task.tsx";
import { Team } from "./team.tsx";
import { Usage } from "./usage.tsx";
import { useDesign } from "./store.ts";

/** The right-hand column: one of the five panels, plus whatever sheet is sliding over it. */
export function Panel(): React.JSX.Element {
  const tab = useDesign((s) => s.tab);
  const sheet = useDesign((s) => s.sheet);
  const sheetDraft = useDesign((s) => s.sheetDraft);
  const floors = useDesign((s) => s.floors);
  const floorSel = useDesign((s) => s.floorSel);
  const task =
    sheet !== null && sheet.type === "task"
      ? (floors[floorSel]?.cards.find((c) => c.id === sheet.id) ?? null)
      : null;
  return (
    <aside
      style={{
        width: "var(--pw,420px)",
        flex: "0 0 var(--pw,420px)",
        borderLeft: "1px solid #1B1B1F",
        background: "linear-gradient(180deg,#0E0E11,#09090A 60%)",
        display: "flex",
        flexDirection: "column",
        minHeight: "0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          height: "120px",
          background: "linear-gradient(180deg,rgba(255,197,49,.05),transparent)",
          pointerEvents: "none",
        }}
      />
      {tab === "Chat" ? <Chat /> : null}
      {tab === "Board" ? <Board /> : null}
      {tab === "Team" ? <Team /> : null}
      {tab === "Usage" ? <Usage /> : null}
      {tab === "Settings" ? <Settings /> : null}
      {sheet !== null && sheet.type === "agent" && sheetDraft !== null ? (
        <AgentSheet draft={sheetDraft} index={sheet.idx} />
      ) : null}
      {task === null ? null : <TaskSheet task={task} />}
    </aside>
  );
}
