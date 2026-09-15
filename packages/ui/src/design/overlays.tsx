import { AgentDialog } from "./agent-dialog.tsx";
import { useFloor } from "./live.ts";

/** The dialogs that belong to a floor but stand over the whole office. */
export function FloorOverlays(): React.JSX.Element | null {
  const floor = useFloor();
  if (floor === null) {
    return null;
  }
  return <AgentDialog floor={floor} />;
}
