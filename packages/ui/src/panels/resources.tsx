import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getClient, requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";

const mb = (bytes: number | null): string =>
  bytes === null ? "–" : `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;

export function ResourcesPanel(): React.JSX.Element {
  const connection = useUi((s) => s.connection);
  const query = useQuery({
    queryKey: ["resources"],
    queryFn: ({ signal }) => requireClient().resources.inventory(undefined, { signal }),
    enabled: connection === "online",
    refetchInterval: 30_000,
  });
  const inventory = query.data ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const prune = (): void => {
    const client = getClient();
    if (client === null) {
      return;
    }
    setBusy(true);
    client.system.gc().then(
      (result) => {
        setNote(
          `removed ${String(result.containers.length)} containers, ${String(result.volumes.length)} volumes, ${String(result.images.length)} images`,
        );
        setBusy(false);
        void query.refetch();
      },
      (error: unknown) => {
        setNote(error instanceof Error ? error.message : String(error));
        setBusy(false);
      },
    );
  };
  return (
    <div className="space-y-3 overflow-y-auto p-3 text-xs">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-panel px-2 py-1 hover:bg-line disabled:opacity-50"
          disabled={busy}
          onClick={prune}
        >
          {busy ? "Pruning…" : "Prune now"}
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
            {String(inventory.snapshot.volumes)} volumes ({mb(inventory.snapshot.volumesBytes)}) ·
            images {mb(inventory.snapshot.imagesBytes)}
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
                  {v.kind} · {mb(v.sizeBytes)}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
