import type { Project, ServicesPolicy } from "@ho/protocol";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Failure, Segmented, Switch } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";

type Props = { project: Project };

const MODES = [
  { value: "rootless", label: "rootless" },
  { value: "rootful", label: "rootful" },
] as const satisfies readonly { value: ServicesPolicy["mode"]; label: string }[];

const NOTE = {
  rootless: "settings.servicesRootless",
  rootful: "settings.servicesRootful",
} as const satisfies Record<ServicesPolicy["mode"], string>;

/**
 * Whether this floor's tasks get their own container engine, so the repository's `docker-compose.yml`
 * runs inside the sandbox. A session with services occupies two of the daemon's session slots.
 */
export function ServicesSettings({ project }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const save = useMutation({
    mutationFn: (patch: Partial<ServicesPolicy>) =>
      requireClient().projects.update({
        id: project.id,
        patch: { services: { ...project.services, ...patch } },
      }),
  });
  const { services } = project;
  return (
    <div className="space-y-3 text-xs">
      <Switch
        checked={services.enabled}
        label={t("settings.servicesLabel")}
        hint={t("settings.servicesHint")}
        onChange={(enabled) => {
          save.mutate({ enabled });
        }}
      />
      {services.enabled ? (
        <div className="animate-rise space-y-2 pl-12">
          <Segmented
            value={services.mode}
            options={MODES}
            onChange={(mode) => {
              save.mutate({ mode });
            }}
          />
          <p className="text-2xs leading-relaxed text-muted-foreground">{t(NOTE[services.mode])}</p>
        </div>
      ) : null}
      <Failure error={save.error} />
    </div>
  );
}
