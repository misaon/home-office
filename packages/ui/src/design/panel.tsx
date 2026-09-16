import { Board } from "./board.tsx";
import { Chat } from "./chat.tsx";
import { Settings } from "./settings.tsx";
import { AgentSheet } from "./sheet-agent.tsx";
import { TaskSheet } from "./sheet-task.tsx";
import { Team } from "./team.tsx";
import { Usage } from "./usage.tsx";
import { useFloor } from "./live.ts";
import { useDesign } from "./store.ts";

const ASIDE =
  "w-420 flex-[0_0_420px] border-l border-line bg-[linear-gradient(180deg,var(--color-panel),var(--color-ground-deep)_60%)] flex flex-col min-h-0 relative overflow-hidden";

export function Panel(): React.JSX.Element | null {
  const tab = useDesign((s) => s.tab);
  const sheet = useDesign((s) => s.sheet);
  const sheetDraft = useDesign((s) => s.sheetDraft);
  const floor = useFloor();
  if (floor === null) {
    return null;
  }
  const task = sheet?.type === "task" ? floor.cards.find((c) => c.id === sheet.id) : undefined;

  return (
    <aside className={ASIDE}>
      <div className="absolute top-0 left-0 right-0 h-120 bg-[linear-gradient(180deg,var(--color-accent-a05),transparent)] pointer-events-none" />
      {tab === "Chat" ? <Chat floor={floor} /> : null}
      {tab === "Board" ? <Board floor={floor} /> : null}
      {tab === "Team" ? <Team floor={floor} /> : null}
      {tab === "Usage" ? <Usage floor={floor} /> : null}
      {tab === "Settings" ? <Settings /> : null}
      {sheet !== null && sheet.type === "agent" && sheetDraft !== null ? (
        <AgentSheet draft={sheetDraft} />
      ) : null}
      {task === undefined ? null : <TaskSheet floor={floor} task={task} />}
    </aside>
  );
}
