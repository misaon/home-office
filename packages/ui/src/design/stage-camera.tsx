import { BOSS_FALLBACK, useDesign, useFloor } from "./store.ts";

const BAR: React.CSSProperties = {
  position: "absolute",
  bottom: "38px",
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  flexWrap: "nowrap",
  padding: "6px",
  borderRadius: "14px",
  background: "rgba(12,12,14,.86)",
  backdropFilter: "blur(18px)",
  border: "1px solid rgba(255,255,255,.13)",
  boxShadow: "0 20px 44px rgba(0,0,0,.5)",
};

const ROUND: React.CSSProperties = {
  width: "30px",
  height: "30px",
  display: "grid",
  placeItems: "center",
  border: "0",
  borderRadius: "9px",
  background: "transparent",
  color: "#CFCCC6",
  cursor: "pointer",
  transition: "all .2s",
};

const WIDE: React.CSSProperties = {
  padding: "0 12px",
  height: "30px",
  border: "0",
  borderRadius: "9px",
  background: "transparent",
  color: "#CFCCC6",
  cursor: "pointer",
  fontSize: "12px",
  whiteSpace: "nowrap",
  transition: "all .2s",
};

/** A square icon button on the camera bar. */
function Round({
  label,
  plus,
  onClick,
}: {
  label: string;
  plus: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={ROUND} className="hop5">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        {plus ? <line x1="6" y1="2.5" x2="6" y2="9.5" /> : null}
        <line x1="2.5" y1="6" x2="9.5" y2="6" />
      </svg>
    </button>
  );
}

/** The camera's own controls, floating over the floor: how close you are, and who you follow. */
export function StageCamera({ internal }: { internal: boolean }): React.JSX.Element {
  const floor = useFloor();
  const zoom = useDesign((s) => s.zoom);
  const followOn = useDesign((s) => s.followOn);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const flash = useDesign((s) => s.flash);
  const boss = floor.team[0] ?? BOSS_FALLBACK;

  return (
    <div style={BAR}>
      <Round
        label="Zoom out"
        plus={false}
        onClick={() => {
          update((s) => ({ zoom: Math.max(50, s.zoom - 10) }));
        }}
      />
      <div
        style={{
          minWidth: "52px",
          textAlign: "center",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: "11.5px",
          color: "#F2EFE8",
        }}
      >
        <span>{zoom}</span>%
      </div>
      <Round
        label="Zoom in"
        plus
        onClick={() => {
          update((s) => ({ zoom: Math.min(200, s.zoom + 10) }));
        }}
      />
      <div
        style={{
          width: "1px",
          height: "18px",
          background: "rgba(255,255,255,.13)",
          margin: "0 4px",
        }}
      />
      <button
        type="button"
        onClick={() => {
          set({ zoom: 100 });
        }}
        style={WIDE}
        className="hop6"
      >
        Fit
      </button>
      <button
        type="button"
        onClick={() => {
          set({ followOn: !followOn });
          flash(followOn ? "Camera released" : `Camera follows ${boss.name}`);
        }}
        style={{
          ...WIDE,
          background: followOn ? "rgba(255,197,49,.16)" : "transparent",
          color: followOn ? "#FFD666" : "#CFCCC6",
        }}
      >
        {`Follow ${boss.name}`}
      </button>
      {internal ? (
        <button
          type="button"
          onClick={() => {
            set({ editor: true });
          }}
          style={{
            padding: "0 14px",
            height: "30px",
            border: "0",
            borderRadius: "9px",
            background: "var(--a,#FFC531)",
            color: "#150F02",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "600",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
            transition: "all .2s",
          }}
          className="hop7"
        >
          Edit floor
        </button>
      ) : null}
    </div>
  );
}
