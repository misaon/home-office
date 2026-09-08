import { errorMessage, formatBytes } from "@ho/protocol";
import { useMutation, useQuery } from "@tanstack/react-query";
import { resourcesQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";

export function ResourcesPanel(): React.JSX.Element {
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
        : `removed ${String(prune.data.containers.length)} containers, ${String(prune.data.volumes.length)} volumes, ${String(prune.data.images.length)} images`;
  return (
    <div className="space-y-3 overflow-y-auto p-3 text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-panel px-2 py-1 hover:bg-line disabled:opacity-50"
          disabled={prune.isPending}
          onClick={() => {
            prune.mutate();
          }}
        >
          {prune.isPending ? "Pruning…" : "Prune now"}
        </button>
        <button
          type="button"
          className="rounded bg-panel px-2 py-1"
          onClick={() => {
            void query.refetch();
          }}
        >
          Refresh
        </button>
        {query.error === null ? null : <span role="alert">{query.error.message}</span>}
        {note !== null ? <span className="text-gray-400">{note}</span> : null}
      </div>
      {inventory === null ? (
        <p className="text-gray-400">No inventory yet.</p>
      ) : (
        <>
          <div className="text-gray-300">
            {String(inventory.snapshot.containers)} containers ·{" "}
            {String(inventory.snapshot.volumes)} volumes (
            {formatBytes(inventory.snapshot.volumesBytes)}) · images{" "}
            {formatBytes(inventory.snapshot.imagesBytes)}
          </div>
          <section>
            <h3 className="mb-1 text-[11px] tracking-wide text-gray-400 uppercase">Containers</h3>
            {inventory.containers.length === 0 ? <p className="text-gray-500">none</p> : null}
            {inventory.containers.map((c) => (
              <div key={c.name} className="flex justify-between border-t border-line py-0.5">
                <span className="truncate font-mono">{c.name}</span>
                <span className="text-gray-400">
                  {c.kind} · {c.state}
                </span>
              </div>
            ))}
          </section>
          <section>
            <h3 className="mb-1 text-[11px] tracking-wide text-gray-400 uppercase">Volumes</h3>
            {inventory.volumes.length === 0 ? <p className="text-gray-500">none</p> : null}
            {inventory.volumes.map((v) => (
              <div key={v.name} className="flex justify-between border-t border-line py-0.5">
                <span className="truncate font-mono">{v.name}</span>
                <span className="text-gray-400">
                  {v.kind} · {formatBytes(v.sizeBytes)}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
