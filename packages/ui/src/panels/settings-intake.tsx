import type { IntakePolicy, IntakeStatus, Project } from "@ho/protocol";
import { useEffect, useState } from "react";
import { getClient } from "../rpc.ts";
import { useUi } from "../store.ts";

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const when = (iso: string | null): string =>
  iso === null ? "never" : new Date(iso).toLocaleTimeString();

type FieldsProps = {
  intake: IntakePolicy;
  labels: string;
  setLabels: (value: string) => void;
  saveLabels: () => void;
  update: (patch: Partial<IntakePolicy>) => void;
};

function IntakeFields({
  intake,
  labels,
  setLabels,
  saveLabels,
  update,
}: FieldsProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-1">
      <label className="flex items-center gap-1">
        every
        <input
          type="number"
          min={30}
          max={3600}
          className="w-16 rounded bg-ink px-1"
          defaultValue={intake.intervalSeconds}
          onBlur={(e) => {
            const seconds = Number(e.target.value);
            if (
              Number.isInteger(seconds) &&
              seconds >= 30 &&
              seconds <= 3600 &&
              seconds !== intake.intervalSeconds
            ) {
              update({ intervalSeconds: seconds });
            }
          }}
        />
        s
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={intake.dryRun}
          onChange={(e) => {
            update({ dryRun: e.target.checked });
          }}
        />
        dry run (log only)
      </label>
      <label className="col-span-2 flex items-center gap-1">
        labels
        <input
          className="flex-1 rounded bg-ink px-1 font-mono"
          placeholder="all open issues"
          value={labels}
          onChange={(e) => {
            setLabels(e.target.value);
          }}
          onBlur={saveLabels}
        />
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={intake.comment}
          onChange={(e) => {
            update({ comment: e.target.checked });
          }}
        />
        comment on the issue
      </label>
      <label className="flex items-center gap-1">
        label
        <input
          className="w-24 rounded bg-ink px-1 font-mono"
          defaultValue={intake.ackLabel}
          onBlur={(e) => {
            if (e.target.value.trim() !== intake.ackLabel) {
              update({ ackLabel: e.target.value.trim() });
            }
          }}
        />
      </label>
    </div>
  );
}

function IntakeHealth({ status }: { status: IntakeStatus | null }): React.JSX.Element | null {
  if (status === null) {
    return null;
  }
  return (
    <p className="text-gray-400">
      last poll {when(status.lastPollAt)}
      {status.nextPollAt === null ? "" : `, next ${when(status.nextPollAt)}`}, received{" "}
      {status.received}
      {status.lastError === null ? "" : ` · error: ${status.lastError}`}
      {status.lastDryRun.length === 0
        ? ""
        : ` · dry run would take: ${status.lastDryRun.join("; ")}`}
    </p>
  );
}

type Props = { project: Project };

/**
 * GitHub Issues intake of one project: enable, interval, label filter, dry run, acknowledgement style,
 * a manual poll and the connector's health. Every change is one `projects.update` with the whole policy.
 */
export function IntakeSettings({ project }: Props): React.JSX.Element {
  const connection = useUi((s) => s.connection);
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [labels, setLabels] = useState(project.intake.labels.join(", "));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = (): void => {
    getClient()
      ?.intake.status()
      .then(
        (all) => {
          setStatus(all.find((s) => s.projectId === project.id) ?? null);
        },
        () => null,
      );
  };
  useEffect(refreshStatus, [connection, project.id, project.intake.enabled]);

  const update = (patch: Partial<IntakePolicy>): void => {
    getClient()
      ?.projects.update({ id: project.id, patch: { intake: { ...project.intake, ...patch } } })
      .then(
        () => {
          setError(null);
        },
        (e: unknown) => {
          setError(describe(e));
        },
      );
  };
  const saveLabels = (): void => {
    const parsed = labels
      .split(",")
      .map((l) => l.trim())
      .filter((l) => l !== "");
    if (parsed.join(",") !== project.intake.labels.join(",")) {
      update({ labels: parsed });
    }
  };
  const pollNow = (): void => {
    const client = getClient();
    if (client === null || busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    client.intake.poll({ projectId: project.id }).then(
      ([result]) => {
        setBusy(false);
        setError(null);
        setMessage(
          result === undefined
            ? "nothing polled"
            : `received ${String(result.received)}, already known ${String(result.duplicates)}${result.dryRun.length === 0 ? "" : `; dry run would take: ${result.dryRun.join("; ")}`}`,
        );
        refreshStatus();
      },
      (e: unknown) => {
        setBusy(false);
        setError(describe(e));
      },
    );
  };

  const { intake } = project;
  return (
    <div className="mt-2 space-y-1 border-t border-line pt-2 text-[11px]">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={intake.enabled}
            onChange={(e) => {
              update({ enabled: e.target.checked });
            }}
          />
          GitHub issues → mail
        </label>
        <button
          type="button"
          className="rounded bg-line px-2 py-0.5 disabled:opacity-50"
          disabled={busy}
          onClick={pollNow}
        >
          {busy ? "Polling…" : "Poll now"}
        </button>
      </div>
      <IntakeFields
        intake={intake}
        labels={labels}
        setLabels={setLabels}
        saveLabels={saveLabels}
        update={update}
      />
      <IntakeHealth status={status} />
      {message === null ? null : <p className="text-emerald-300">{message}</p>}
      {error === null ? null : <p className="text-red-400">{error}</p>}
    </div>
  );
}
