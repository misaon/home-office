import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ProjectUpdateInput } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { useOfficeMutation } from "./store.ts";

const TRACK =
  "flex-[0_0_38px] w-38 h-22 rounded-pill border-0 cursor-pointer p-3 flex transition-[background] duration-300";

const KNOB = "w-16 h-16 rounded-half transition-transform duration-340 ease-spring-far";

const ROW = "flex flex-col gap-4 mb-14";

function Switch({
  on,
  title,
  hint,
  onFlip,
}: {
  on: boolean;
  title: string;
  hint: string;
  onFlip: () => void;
}): React.JSX.Element {
  return (
    <div className={ROW}>
      {/* An enclosing `<label>` is the pattern Base UI documents for naming a switch; the hint stays
          outside it so the accessible name is the title alone. */}
      <label className="flex gap-11 items-start cursor-pointer">
        <BaseSwitch.Root
          checked={on}
          onCheckedChange={onFlip}
          className={`${TRACK} bg-border-strong data-checked:bg-accent`}
        >
          <BaseSwitch.Thumb
            className={`${KNOB} bg-ink-idle translate-x-0 data-checked:bg-accent-ink data-checked:translate-x-16`}
          />
        </BaseSwitch.Root>
        <span className="text-13">{title}</span>
      </label>
      <div className="text-11h text-ink-meta leading-prose mt-4 -ml-11">{hint}</div>
    </div>
  );
}

export function FloorSwitches({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const update = useOfficeMutation({
    mutationFn: (patch: ProjectUpdateInput["patch"]) =>
      requireClient().projects.update({ id: floor.id, patch }),
  });

  return (
    <>
      <Switch
        on={floor.pr}
        title={t("project.pullRequests")}
        hint={t("project.pullRequestsHint")}
        onFlip={() => {
          update.mutate({ publish: { mode: floor.pr ? "branch" : "pull-request" } });
        }}
      />
      <Switch
        on={floor.issues}
        title={t("settings.intake")}
        hint={t("settings.intakeHint")}
        onFlip={() => {
          update.mutate({ intake: { enabled: !floor.issues } });
        }}
      />
      <Switch
        on={floor.hiring}
        title={t("settings.hiringLabel")}
        hint={t("settings.hiringHint")}
        onFlip={() => {
          update.mutate({ hiring: { enabled: !floor.hiring } });
        }}
      />
      <Switch
        on={floor.preview.enabled}
        title={t("settings.previewLabel", { port: floor.preview.port })}
        hint={t("settings.previewHint", { port: floor.preview.port })}
        onFlip={() => {
          update.mutate({ preview: { enabled: !floor.preview.enabled } });
        }}
      />
      <Switch
        on={floor.services}
        title={t("settings.servicesLabel")}
        hint={t("settings.servicesHint")}
        onFlip={() => {
          update.mutate({ services: { enabled: !floor.services } });
        }}
      />
      <Switch
        on={floor.trust === "trusted"}
        title={t("settings.trustLabel")}
        hint={t("settings.trustHint")}
        onFlip={() => {
          update.mutate({
            services: { trust: floor.trust === "trusted" ? "untrusted" : "trusted" },
          });
        }}
      />
    </>
  );
}
