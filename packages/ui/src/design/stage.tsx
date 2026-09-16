import { StageCamera } from "./stage-camera.tsx";
import { useOffice } from "../office/office-canvas.tsx";

const FRAME =
  "flex-1 min-w-0 relative rounded-20 border border-edge-lit overflow-hidden bg-floor shadow-floor";

export function Stage({ internal }: { internal: boolean }): React.JSX.Element {
  const { ref, handle } = useOffice();

  return (
    <section className="flex-1 min-w-0 relative flex p-22 bg-dots">
      <div className={FRAME}>
        <div ref={ref} className="absolute inset-0" />
        <div className="absolute left-0 right-0 top-0 h-2 bg-[linear-gradient(90deg,transparent,var(--color-accent-a55),transparent)] animate-scan pointer-events-none" />
      </div>
      <StageCamera internal={internal} office={handle} />
    </section>
  );
}
