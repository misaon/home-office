import { errorMessage, type Project, type ServicesPolicy } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { Segmented } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";

type Props = { project: Project };

const MODES = [
  { value: "rootless", label: "rootless" },
  { value: "rootful", label: "rootful" },
] as const satisfies readonly { value: ServicesPolicy["mode"]; label: string }[];

const NOTE: Record<ServicesPolicy["mode"], string> = {
  rootless:
    "The engine runs as a non-root user inside a user namespace. Per-service limits (mem_limit) are accepted but not enforced; the engine's own limit caps the whole environment.",
  rootful:
    "Full Compose fidelity, and a wider boundary: a successful escape from this engine is root inside the Docker VM.",
};

/**
 * Whether this floor's tasks get their own container engine, so the repository's `docker-compose.yml`
 * runs inside the sandbox. A session with services occupies two of the daemon's session slots.
 */
export function ServicesSettings({ project }: Props): React.JSX.Element {
  const save = useMutation({
    mutationFn: (patch: Partial<ServicesPolicy>) =>
      requireClient().projects.update({
        id: project.id,
        patch: { services: { ...project.services, ...patch } },
      }),
  });
  const { services } = project;
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={services.enabled}
            onChange={(e) => {
              save.mutate({ enabled: e.target.checked });
            }}
          />
          Task services (own Docker engine)
        </label>
        {services.enabled ? (
          <Segmented
            value={services.mode}
            options={MODES}
            onChange={(mode) => {
              save.mutate({ mode });
            }}
          />
        ) : null}
      </div>
      {services.enabled ? <p className="text-gray-400">{NOTE[services.mode]}</p> : null}
      {save.error === null ? null : <p className="text-red-400">{errorMessage(save.error)}</p>}
    </div>
  );
}
