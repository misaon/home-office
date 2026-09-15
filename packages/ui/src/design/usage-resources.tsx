import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { resourcesQuery } from "../queries.ts";
import type { Floor } from "./data.ts";
import { MONO, separator } from "./tokens.ts";

const CARD = "rounded-14 bg-card border border-edge overflow-hidden mb-18";

const RULE = `${MONO} text-10 tracking-caps-wider uppercase text-ink-label`;

const NAME = `${MONO} text-12 overflow-hidden text-ellipsis whitespace-nowrap`;

const gb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** A rule with its count on the right. */
function Rule({ name, count }: { name: string; count: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-8 mt-0 mx-2 mb-9">
      <span className={RULE}>{name}</span>
      <span className="flex-1 h-1 bg-slot" />
      <span className={`${MONO} text-10h text-ink-meta`}>{count}</span>
    </div>
  );
}

/** What the office is actually running on: the sandboxes that exist and the disk they hold. */
export function UsageResources({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const query = useQuery({ ...resourcesQuery, refetchInterval: 20_000 });
  const inventory = query.data;

  if (inventory === undefined) {
    return (
      <div className="py-16 px-2 text-12 text-ink-meta">
        {query.isError ? t("resources.failed") : t("common.checking")}
      </div>
    );
  }

  return (
    <div className="animate-lift-350">
      <Rule name={t("resources.containers")} count={String(inventory.containers.length)} />
      <div className={CARD}>
        {inventory.containers.map((box, i) => {
          const up = box.state === "running";
          return (
            <div key={box.name} className={`flex items-stretch ${separator(i === 0)}`}>
              <div className={`w-3 flex-[0_0_3px] ${up ? "bg-good" : "bg-dot-idle"}`} />
              <div className="flex-1 min-w-0 py-12 px-13">
                <div className="flex items-center gap-8">
                  <span className={NAME}>{box.name}</span>
                  <div className="flex-1" />
                  <span className={`${MONO} text-10 text-ink-meta flex-[0_0_auto]`}>
                    {box.state}
                  </span>
                </div>
                <div className={`${MONO} text-10 text-ink-meta mt-6`}>{box.kind}</div>
              </div>
            </div>
          );
        })}
        {inventory.containers.length === 0 ? (
          <div className="py-16 px-13 text-12 text-ink-meta">{t("resources.noneRunning")}</div>
        ) : null}
        <div className="flex items-center gap-11 p-13 border-t border-rule bg-dialog">
          <span className="w-8 h-8 rounded-half bg-good shadow-glow-good flex-[0_0_auto]" />
          <div className="flex-1 min-w-0">
            <div className="text-13">{t("resources.engine")}</div>
            <div className={`${MONO} text-10h text-ink-meta mt-3`}>
              {t("resources.held", {
                volumes: inventory.snapshot.volumes,
                images: gb(inventory.snapshot.imagesBytes),
                disk: gb(inventory.snapshot.volumesBytes),
              })}
            </div>
          </div>
        </div>
      </div>
      <Rule name={t("resources.floor")} count={floor.name} />
    </div>
  );
}
