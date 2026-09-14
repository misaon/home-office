import { Board } from "./board.tsx";
import { Chat } from "./chat.tsx";
import { Settings } from "./settings.tsx";
import { AgentSheet } from "./sheet-agent.tsx";
import { TaskSheet } from "./sheet-task.tsx";
import { Team } from "./team.tsx";
import { Usage } from "./usage.tsx";
import { useFloor } from "./live.ts";
import { useDesign } from "./store.ts";

const ASIDE: React.CSSProperties = {
  width: "var(--pw,420px)",
  flex: "0 0 var(--pw,420px)",
  borderLeft: "1px solid #1B1B1F",
  background: "linear-gradient(180deg,#0E0E11,#09090A 60%)",
  display: "flex",
  flexDirection: "column",
  minHeight: "0",
  position: "relative",
  overflow: "hidden",
};

/** The right-hand column: one of the five panels, plus whatever sheet is sliding over it. */
export function Panel(): React.JSX.Element | null {
  const tab = useDesign((s) => s.tab);
  const sheet = useDesign((s) => s.sheet);
  const sheetDraft = useDesign((s) => s.sheetDraft);
  const floor = useFloor();
  if (floor === null) {
    return null;
  }
  const task =
    sheet !== null && sheet.type === "task"
      ? floor.cards.find((c) => c.id === sheet.id)
      : undefined;

  return (
    <aside style={ASIDE}>
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
      {tab === "Chat" ? <Chat floor={floor} /> : null}
      {tab === "Board" ? <Board floor={floor} /> : null}
      {tab === "Team" ? <Team floor={floor} /> : null}
      {tab === "Usage" ? <Usage floor={floor} /> : null}
      {tab === "Settings" ? <Settings /> : null}
      {sheet !== null && sheet.type === "agent" && sheetDraft !== null ? (
        <AgentSheet floor={floor} draft={sheetDraft} />
      ) : null}
      {task === undefined ? null : <TaskSheet floor={floor} task={task} />}
    </aside>
  );
}
