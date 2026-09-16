import { Accordion } from "@base-ui/react/accordion";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { ChevronRight } from "lucide-react";
import { FloorConfigFile } from "./settings-floor-config.tsx";
import { FloorSwitches } from "./settings-floor-switches.tsx";
import { useUi } from "../store.ts";
import { MONO, separator } from "./tokens.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const HEAD =
  "w-full flex items-center gap-10 p-13 border-0 bg-transparent cursor-pointer text-left transition-[background] duration-200";

const BADGE = `w-20 h-20 flex-[0_0_20px] rounded-6 grid place-items-center ${MONO} text-10h`;

const NAME = `block ${MONO} text-12h overflow-hidden text-ellipsis whitespace-nowrap`;

const PATH = `${MONO} text-10h text-ink-meta mb-14 overflow-hidden text-ellipsis whitespace-nowrap`;

const REMOVE =
  "py-7 px-12 rounded-9 border border-bad-a30 bg-bad-a10 text-bad-soft text-11h cursor-pointer transition-all duration-200";

export function SettingsFloor({
  floor,
  index,
  first,
}: {
  floor: Floor;
  index: number;
  first: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const current = useUi((s) => s.floorId) === floor.id;
  const flash = useDesign((s) => s.flash);
  const confirm = useDesign((s) => s.confirm);
  const openTasks = floor.cards.filter((x) => x.s !== "done").length;

  const remove = useOfficeMutation({
    mutationFn: () => requireClient().projects.remove({ id: floor.id }),
    onSuccess: () => {
      flash(t("project.removed", { name: floor.name }));
    },
  });

  return (
    <Accordion.Item value={floor.id} className={`flex items-stretch ${separator(first)}`}>
      <div className={`w-3 flex-[0_0_3px] ${current ? "bg-accent" : "bg-border-strong"}`} />
      <div className="flex-1 min-w-0">
        <Accordion.Header>
          <Accordion.Trigger className={`hover:bg-row-hover ${HEAD}`}>
            <span
              className={`${BADGE} ${current ? "bg-accent" : "bg-edge-lit"} ${current ? "text-accent-ink" : "text-ink-faint"}`}
            >
              <span>{index + 1}</span>
            </span>
            <span className="flex-1 min-w-0">
              <span className={NAME}>{floor.name}</span>
              <span className="block text-10h text-ink-meta mt-4">
                {t("project.summaryTasks", { agents: floor.team.length, open: openTasks })}
              </span>
            </span>
            <ChevronRight
              size={9}
              strokeWidth={1.5}
              className="flex-[0_0_auto] stroke-ink-meta transition-transform duration-300 rotate-0 data-panel-open:rotate-90"
            />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>
          <div className="pt-0 px-13 pb-14">
            <div className={PATH}>{floor.path}</div>
            <FloorSwitches floor={floor} />
            <FloorConfigFile floor={floor} />
            <div className="h-1 bg-slot my-14 mx-0" />
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                confirm({
                  title: t("project.removeTitle"),
                  body: t("project.confirmRemove", { name: floor.name }),
                  okLabel: t("settings.removeFloor"),
                  act: () => {
                    remove.mutate();
                  },
                });
              }}
              className={`hover:bg-bad-a20 ${REMOVE}`}
            >
              {t("settings.removeFloor")}
            </button>
          </div>
        </Accordion.Panel>
      </div>
    </Accordion.Item>
  );
}
