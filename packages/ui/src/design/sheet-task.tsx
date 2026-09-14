import { PRIMARY, SheetShell } from "./sheet-shell.tsx";
import { MONO, priority } from "./tokens.ts";
import { BOSS_FALLBACK, useDesign, useFloor } from "./store.ts";
import type { Card } from "./data.ts";

const TAG: React.CSSProperties = {
  ...MONO,
  fontSize: "9.5px",
  padding: "4px 9px",
  borderRadius: "6px",
};

/** What happened to a task so far — three beats, the last one written by its state. */
function logOf(task: Card, boss: string): { t: string; x: string }[] {
  return [
    { t: task.at, x: `${boss} picked the task up from mail.` },
    { t: "+2m", x: `Sandbox started, branch task/${String(task.id)} created.` },
    {
      t: "+14m",
      x:
        task.s === "done"
          ? "Tests green, branch pushed."
          : task.s === "blocked"
            ? "Waiting for an answer from you."
            : "Editing files, 12 tool calls so far.",
    },
  ];
}

/** One task, opened up: what it is, what has happened, and the two ways it can leave this state. */
export function TaskSheet({ task }: { task: Card }): React.JSX.Element {
  const floor = useFloor();
  const set = useDesign((s) => s.set);
  const patchCur = useDesign((s) => s.patchCur);
  const flash = useDesign((s) => s.flash);
  const boss = floor.team[0] ?? BOSS_FALLBACK;
  const { pBg, pFg } = priority(task.p);
  const move = (s: Card["s"], note: string): void => {
    const cards = [...floor.cards];
    const at = cards.findIndex((x) => x.id === task.id);
    if (at !== -1) {
      cards[at] = { ...task, s };
    }
    patchCur({ cards });
    set({ sheet: null });
    flash(note);
  };

  return (
    <SheetShell
      title={task.t}
      titleStyle={{ fontSize: "14px", lineHeight: "1.4", textWrap: "pretty" }}
    >
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ ...TAG, background: pBg, color: pFg }}>{task.p}</span>
        <span style={{ ...TAG, background: "#24242A", color: "#BEBBB4" }}>{task.k}</span>
        <span style={{ ...TAG, background: "#24242A", color: "#BEBBB4" }}>{task.s}</span>
      </div>
      <div
        style={{
          ...MONO,
          fontSize: "10px",
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "#ABA8A1",
          marginBottom: "10px",
        }}
      >
        activity
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginBottom: "18px" }}>
        {logOf(task, boss.name).map((line) => (
          <div
            key={line.t}
            style={{
              display: "flex",
              gap: "11px",
              padding: "12px",
              borderRadius: "12px",
              background: "#111114",
              border: "1px solid #26262C",
            }}
          >
            <span style={{ ...MONO, fontSize: "10px", color: "#A6A39C", flex: "0 0 auto" }}>
              {line.t}
            </span>
            <span style={{ fontSize: "12.5px", color: "#E4E1DB", lineHeight: "1.5" }}>
              {line.x}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "9px" }}>
        <button
          type="button"
          onClick={() => {
            move("done", "Task moved to done");
          }}
          style={PRIMARY}
          className="hopm"
        >
          Move to done
        </button>
        <button
          type="button"
          onClick={() => {
            move("running", `Task handed back to ${boss.name}`);
          }}
          style={{
            padding: "11px 15px",
            borderRadius: "11px",
            border: "1px solid #2C2C32",
            background: "transparent",
            color: "#CFCCC6",
            fontSize: "12.5px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all .2s",
          }}
          className="hop8"
        >
          Hand back
        </button>
      </div>
    </SheetShell>
  );
}
