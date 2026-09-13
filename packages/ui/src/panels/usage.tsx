import { formatBytes, type UsageSummary } from "@ho/protocol";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, CARD, Empty, Failure, Section, Segmented } from "../kit/controls.tsx";
import { resourcesQuery, usageQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { useOnline } from "../store.ts";

const fmt = (n: number): string => n.toLocaleString();

/** One number with its name under it, the way a dashboard states a total. */
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className={`${CARD} animate-rise p-3`}>
      <div className="font-mono text-lg tracking-tight">{value}</div>
      <div className="mt-0.5 text-2xs text-faint">{label}</div>
      {hint === undefined ? null : <div className="text-2xs text-faint">{hint}</div>}
    </div>
  );
}

function Buckets({
  title,
  rows,
}: {
  title: string;
  rows: UsageSummary["byAgent"];
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return null;
  }
  return (
    <Section title={title}>
      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full text-left text-xs">
          <thead className="text-2xs text-faint">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-normal">{t("usage.name")}</th>
              <th className="px-2 py-2 text-right font-normal">{t("usage.in")}</th>
              <th className="px-2 py-2 text-right font-normal">{t("usage.out")}</th>
              <th className="px-2 py-2 text-right font-normal">{t("usage.cache")}</th>
              <th className="px-3 py-2 text-right font-normal">{t("usage.sessions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line/60 hover:bg-line/20">
                <td className="max-w-40 truncate px-3 py-1.5">{r.label}</td>
                <td className="px-2 text-right font-mono text-2xs">{fmt(r.usage.inputTokens)}</td>
                <td className="px-2 text-right font-mono text-2xs">{fmt(r.usage.outputTokens)}</td>
                <td className="px-2 text-right font-mono text-2xs">
                  {fmt(r.usage.cacheReadTokens)}
                </td>
                <td className="px-3 text-right font-mono text-2xs">{String(r.sessions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

const WINDOWS = [
  { value: "24", label: "usage.day" },
  { value: "168", label: "usage.week" },
  { value: "0", label: "usage.all" },
] as const;

/** What the office spent, over a window the reader picks. */
function Tokens(): React.JSX.Element {
  const { t } = useTranslation();
  const online = useOnline();
  const [hours, setHours] = useState(24);
  const query = useQuery({ ...usageQuery(hours), enabled: online, refetchInterval: 10_000 });
  const summary = query.data ?? null;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-2xs text-faint">{t("usage.window")}</span>
        <Segmented
          value={String(hours)}
          options={WINDOWS.map(({ value, label }) => ({ value, label: t(label) }))}
          onChange={(value) => {
            setHours(Number(value));
          }}
        />
      </div>
      <Failure error={query.error} />
      {summary === null ? (
        <Empty>{t("usage.noData")}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t("usage.in")} value={fmt(summary.totals.inputTokens)} />
            <Stat label={t("usage.out")} value={fmt(summary.totals.outputTokens)} />
            <Stat label={t("usage.cache")} value={fmt(summary.totals.cacheReadTokens)} />
            <Stat
              label={t("usage.sessions")}
              value={String(summary.sessions)}
              hint={t("usage.limits", { count: summary.rateLimitIncidents })}
            />
          </div>
          <Buckets title={t("usage.byAgent")} rows={summary.byAgent} />
          <Buckets title={t("usage.byProject")} rows={summary.byProject} />
          <Buckets title={t("usage.byDay")} rows={summary.byDay} />
          <p className="text-2xs leading-relaxed text-faint">{t("usage.note")}</p>
        </>
      )}
    </div>
  );
}

/** What the office holds on this machine, and the one button that lets go of what it no longer needs. */
function Resources(): React.JSX.Element {
  const { t } = useTranslation();
  const online = useOnline();
  const query = useQuery({ ...resourcesQuery, enabled: online, refetchInterval: 30_000 });
  const inventory = query.data ?? null;
  const prune = useMutation({
    mutationFn: () => requireClient().system.gc(),
    onSuccess: () => query.refetch(),
  });
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={prune.isPending}
            onClick={() => {
              prune.mutate();
            }}
          >
            {prune.isPending ? t("resources.pruning") : t("resources.prune")}
          </Button>
          <Button
            onClick={() => {
              void query.refetch();
            }}
          >
            {t("resources.refresh")}
          </Button>
          {prune.data === undefined ? null : (
            <span className="animate-fade text-2xs text-good">
              {t("resources.pruned", {
                containers: prune.data.containers.length,
                volumes: prune.data.volumes.length,
                images: prune.data.images.length,
              })}
            </span>
          )}
        </div>
        <p className="text-2xs leading-relaxed text-faint">{t("resources.pruneHint")}</p>
      </div>
      <Failure error={query.error ?? prune.error} />
      {inventory === null ? (
        <Empty>{t("resources.noInventory")}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t("resources.containers")} value={String(inventory.snapshot.containers)} />
            <Stat
              label={t("resources.volumes")}
              value={String(inventory.snapshot.volumes)}
              hint={formatBytes(inventory.snapshot.volumesBytes)}
            />
            <Stat
              label={t("resources.images")}
              value={formatBytes(inventory.snapshot.imagesBytes)}
            />
          </div>
          <Section
            title={t("resources.containers")}
            aside={<Badge>{inventory.containers.length}</Badge>}
          >
            {inventory.containers.length === 0 ? (
              <Empty>{t("resources.noneRunning")}</Empty>
            ) : (
              <div className={`${CARD} divide-y divide-line/60`}>
                {inventory.containers.map((c) => (
                  <div key={c.name} className="flex justify-between gap-3 px-3 py-2 text-xs">
                    <span className="truncate font-mono text-2xs">{c.name}</span>
                    <span className="shrink-0 text-2xs text-faint">
                      {c.kind} · {c.state}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title={t("resources.volumes")} aside={<Badge>{inventory.volumes.length}</Badge>}>
            {inventory.volumes.length === 0 ? (
              <Empty>{t("resources.noneStored")}</Empty>
            ) : (
              <div className={`${CARD} divide-y divide-line/60`}>
                {inventory.volumes.map((v) => (
                  <div key={v.name} className="flex justify-between gap-3 px-3 py-2 text-xs">
                    <span className="truncate font-mono text-2xs">{v.name}</span>
                    <span className="shrink-0 text-2xs text-faint">
                      {v.kind} · {formatBytes(v.sizeBytes)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/** What the office costs: the tokens it spends and the disk it holds, one switch apart. */
export function UsagePanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [view, setView] = useState<"tokens" | "resources">("tokens");
  return (
    <div className="h-full space-y-5 overflow-y-auto p-4">
      <Segmented
        value={view}
        options={[
          { value: "tokens", label: t("usage.tokens") },
          { value: "resources", label: t("usage.resources") },
        ]}
        onChange={setView}
      />
      <div key={view} className="animate-fade">
        {view === "tokens" ? <Tokens /> : <Resources />}
      </div>
    </div>
  );
}
