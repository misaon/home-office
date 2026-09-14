import { StageCamera } from "./stage-camera.tsx";
import { Puck } from "./stage-puck.tsx";
import { useDesign, useFloor } from "./store.ts";

/** The floor itself: a lit plan with the team drifting over it, and the camera controls under it. */
export function Stage({ internal }: { internal: boolean }): React.JSX.Element {
  const floor = useFloor();
  const zoom = useDesign((s) => s.zoom);
  const cell = String(Math.round((32 * zoom) / 100));

  return (
    <section
      style={{
        flex: "1",
        minWidth: "0",
        position: "relative",
        display: "flex",
        padding: "22px",
        backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    >
      <div
        style={{
          flex: "1",
          minWidth: "0",
          position: "relative",
          borderRadius: "20px",
          border: "1px solid #24242A",
          overflow: "hidden",
          background: "var(--floor,#EDEBE4)",
          boxShadow: "0 40px 90px rgba(0,0,0,.55)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0",
            backgroundImage:
              "linear-gradient(var(--gridl,rgba(0,0,0,.07)) 1px,transparent 1px),linear-gradient(90deg,var(--gridl,rgba(0,0,0,.07)) 1px,transparent 1px)",
            transition: "background-size .5s cubic-bezier(.2,.8,.3,1)",
            backgroundSize: `${cell}px ${cell}px`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "0",
            right: "0",
            top: "0",
            height: "2px",
            background: "linear-gradient(90deg,transparent,rgba(255,197,49,.55),transparent)",
            animation: "scan 9s linear infinite",
          }}
        />
        {floor.team.slice(0, 4).map((person, i) => (
          <Puck key={person.name} person={person} index={i} />
        ))}
      </div>
      <StageCamera internal={internal} />
    </section>
  );
}
