import { errorMessage, formatBytes } from "@ho/protocol";
import { useMutation, useQuery } from "@tanstack/react-query";
import { resourcesQuery } from "../queries.ts";
import { useTranslation } from "react-i18next";
import { Button, Section } from "../kit/controls.tsx";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";

export function ResourcesPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const query = useQuery({
    ...resourcesQuery,
    enabled: connection === "online",
    refetchInterval: 30_000,
  });
  const inventory = query.data ?? null;
  const prune = useMutation({
    mutationFn: () => requireClient().system.gc(),
    onSuccess: () => query.refetch(),
  });
  const note =
    prune.error !== null
      ? errorMessage(prune.error)
      : prune.data === undefined
        ? null
        : t("resources.pruned", {
            containers: prune.data.containers.length,
            volumes: prune.data.volumes.length,
            images: prune.data.images.length,
          });
  return (
    <div className="h-full space-y-5 overflow-y-auto p-4 text-xs">
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
        {query.error === null ? null : <span role="alert">{query.error.message}</span>}
        {note !== null ? <span className="text-gray-400">{note}</span> : null}
      </div>
      {inventory === null ? (
        <p className="text-gray-400">{t("resources.noInventory")}</p>
      ) : (
        <>
          <div className="text-gray-300">
            {t("resources.summary", {
              containers: inventory.snapshot.containers,
              volumes: inventory.snapshot.volumes,
              volumeBytes: formatBytes(inventory.snapshot.volumesBytes),
              imageBytes: formatBytes(inventory.snapshot.imagesBytes),
            })}
          </div>
          <Section title={t("resources.containers")}>
            {inventory.containers.length === 0 ? (
              <p className="text-gray-500">{t("common.none")}</p>
            ) : null}
            {inventory.containers.map((c) => (
              <div key={c.name} className="flex justify-between gap-3 border-t border-line py-1.5">
                <span className="truncate font-mono">{c.name}</span>
                <span className="shrink-0 text-gray-400">
                  {c.kind} · {c.state}
                </span>
              </div>
            ))}
          </Section>
          <Section title={t("resources.volumes")}>
            {inventory.volumes.length === 0 ? (
              <p className="text-gray-500">{t("common.none")}</p>
            ) : null}
            {inventory.volumes.map((v) => (
              <div key={v.name} className="flex justify-between gap-3 border-t border-line py-1.5">
                <span className="truncate font-mono">{v.name}</span>
                <span className="shrink-0 text-gray-400">
                  {v.kind} · {formatBytes(v.sizeBytes)}
                </span>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
