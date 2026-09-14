import type { Floor } from "./data.ts";
import { useDesign } from "./store.ts";

const TRACK: React.CSSProperties = {
  flex: "0 0 38px",
  width: "38px",
  height: "22px",
  borderRadius: "99px",
  border: "0",
  cursor: "pointer",
  padding: "3px",
  display: "flex",
  transition: "background .3s",
};

const KNOB: React.CSSProperties = {
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  transition: "transform .34s cubic-bezier(.34,1.5,.5,1)",
};

/** Whether finished work leaves this floor as a pull request or just as a pushed branch. */
export function PullRequestToggle({
  floor,
  index,
}: {
  floor: Floor;
  index: number;
}): React.JSX.Element {
  const patchFloor = useDesign((s) => s.patchFloor);
  const flash = useDesign((s) => s.flash);
  return (
    <div style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
      <button
        type="button"
        aria-label="Open a pull request"
        onClick={() => {
          patchFloor(index, { pr: !floor.pr });
          flash(
            floor.pr ? `Pull requests off for ${floor.name}` : `Pull requests on for ${floor.name}`,
          );
        }}
        style={{ ...TRACK, background: floor.pr ? "var(--a,#FFC531)" : "#2C2C32" }}
      >
        <span
          style={{
            ...KNOB,
            background: floor.pr ? "#150F02" : "#8E8B85",
            transform: `translateX(${floor.pr ? "16px" : "0px"})`,
          }}
        />
      </button>
      <div>
        <div style={{ fontSize: "13px" }}>Open a pull request</div>
        <div
          style={{
            fontSize: "11.5px",
            color: "#A6A39C",
            lineHeight: "1.6",
            marginTop: "4px",
          }}
        >
          On: finished work arrives as a pull request. Off: the branch is pushed and nothing else
          happens.
        </div>
      </div>
    </div>
  );
}
