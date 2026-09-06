import { useState } from "react";
import type { LabSession } from "./session.ts";
import type { LabRuntime } from "./use-lab-runtime.ts";

export const LAB_BUTTON =
  "rounded border border-[#476464] px-3 py-1.5 text-xs text-[#e6dac7] hover:bg-[#304745] disabled:opacity-40";
type Props = { lab: LabRuntime; session: LabSession };

export function LabControls({ lab, session }: Props): React.JSX.Element {
  const [grid, setGrid] = useState(false);
  const [paused, setPaused] = useState(false);
  const focus = (frame: { x: number; y: number; width: number; height: number } | null): void => {
    if (lab.runtime.current !== null) {
      lab.runtime.current.scene.frame = frame;
      lab.runtime.current.scene.fitMode = frame === null ? "contain" : "pixels";
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#385153] px-5 py-2">
      <button
        className={LAB_BUTTON}
        type="button"
        disabled={!lab.ready}
        onClick={() => {
          focus(null);
        }}
      >
        Celý půdorys
      </button>
      <button
        className={LAB_BUTTON}
        type="button"
        disabled={!lab.ready}
        onClick={() => {
          focus({ x: 28 * 16, y: 4 * 16, width: 16 * 16, height: 17 * 16 });
        }}
      >
        Detail pracoviště
      </button>
      <button
        className={LAB_BUTTON}
        type="button"
        disabled={!lab.ready}
        onClick={() => {
          focus({ x: 0, y: 20 * 16, width: 29 * 16, height: 14 * 16 });
        }}
      >
        Detail výtahu
      </button>
      <button
        className={LAB_BUTTON}
        type="button"
        disabled={!lab.ready}
        aria-pressed={grid}
        onClick={() => {
          setGrid(!grid);
          lab.runtime.current?.view.grid(!grid);
        }}
      >
        Mřížka {grid ? "●" : "○"}
      </button>
      <button
        className={LAB_BUTTON}
        type="button"
        disabled={!lab.ready}
        onClick={() => {
          session.replay();
        }}
      >
        Přehrát příjezd
      </button>
      <button
        className={LAB_BUTTON}
        type="button"
        disabled={!lab.ready}
        onClick={() => {
          session.tour();
        }}
      >
        Projít všechny cíle
      </button>
      <button
        className={LAB_BUTTON}
        type="button"
        disabled={!lab.ready}
        aria-pressed={paused}
        onClick={() => {
          setPaused(!paused);
          lab.paused.current = !paused;
          if (paused) {
            lab.runtime.current?.scene.app.ticker.start();
          } else {
            lab.runtime.current?.scene.app.ticker.stop();
          }
        }}
      >
        {paused ? "Pokračovat" : "Pozastavit"}
      </button>
    </div>
  );
}

export function LabFooter({ lab, session }: Props): React.JSX.Element {
  const [target, setTarget] = useState("dev-3");
  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-[#385153] px-5 py-3 text-xs">
      <label htmlFor="lab-target">Poslat Alexe:</label>
      <select
        id="lab-target"
        className="rounded bg-[#304745] px-2 py-1"
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
        }}
      >
        {session.plan.template.anchors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.id}
          </option>
        ))}
      </select>
      <button
        className={LAB_BUTTON}
        type="button"
        disabled={!lab.ready}
        onClick={() => {
          session.visit(target);
        }}
      >
        Přejít
      </button>
      <span role="status" className="text-[#e7cd8b]">
        {lab.status}
      </span>
      <span className="ml-auto text-[#9db4af]">
        Klikni na volnou podlahu · 80 × 46 polí · 6 DEV / 2 QA / 2 AN / 1 ŠÉF
      </span>
    </footer>
  );
}
