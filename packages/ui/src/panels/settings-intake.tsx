import { errorMessage, type IntakePolicy, type IntakeStatus, type Project } from "@ho/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../kit/controls.tsx";
import { intakeStatusQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { useUi } from "../store.ts";

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
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      <label className="flex items-center gap-2">
        {t("settings.intakeEvery")}
        <input
          type="number"
          min={30}
          max={3600}
          className="w-16 rounded-md border border-line bg-ink px-2 py-1"
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
        {t("settings.intakeSeconds")}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={intake.dryRun}
          onChange={(e) => {
            update({ dryRun: e.target.checked });
          }}
        />
        {t("settings.intakeDry")}
      </label>
      <label className="col-span-2 flex items-center gap-2">
        {t("settings.intakeLabels")}
        <input
          className="flex-1 rounded-md border border-line bg-ink px-2 py-1 font-mono"
          placeholder={t("settings.intakeAllIssues")}
          value={labels}
          onChange={(e) => {
            setLabels(e.target.value);
          }}
          onBlur={saveLabels}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={intake.comment}
          onChange={(e) => {
            update({ comment: e.target.checked });
          }}
        />
        {t("settings.intakeComment")}
      </label>
      <label className="flex items-center gap-2">
        {t("settings.intakeAckLabel")}
        <input
          className="w-24 rounded-md border border-line bg-ink px-2 py-1 font-mono"
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
  const { t } = useTranslation();
  if (status === null) {
    return null;
  }
  return (
    <p className="leading-relaxed text-gray-400">
      {t("settings.intakeLastPoll", { when: when(status.lastPollAt) })}
      {status.nextPollAt === null
        ? ""
        : t("settings.intakeNext", { when: when(status.nextPollAt) })}
      {", "}
      {t("settings.intakeReceived", { received: status.received, duplicates: 0 })}
      {status.lastError === null ? "" : t("settings.intakeError", { message: status.lastError })}
      {status.lastDryRun.length === 0
        ? ""
        : t("settings.intakeDryRun", { items: status.lastDryRun.join("; ") })}
    </p>
  );
}

type Props = { project: Project };

/**
 * GitHub Issues intake of one project: enable, interval, label filter, dry run, acknowledgement style,
 * a manual poll and the connector's health. Every change is one `projects.update` with the whole policy.
 */
export function IntakeSettings({ project }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const connection = useUi((s) => s.connection);
  const queries = useQueryClient();
  const all = useQuery({ ...intakeStatusQuery, enabled: connection === "online" });
  const status: IntakeStatus | null =
    all.data?.find((entry) => entry.projectId === project.id) ?? null;
  const [labels, setLabels] = useState(project.intake.labels.join(", "));
  const invalidateStatus = (): Promise<void> =>
    queries.invalidateQueries({ queryKey: intakeStatusQuery.queryKey });

  const save = useMutation({
    mutationFn: (patch: Partial<IntakePolicy>) =>
      requireClient().projects.update({
        id: project.id,
        patch: { intake: { ...project.intake, ...patch } },
      }),
    onSuccess: invalidateStatus,
  });
  const poll = useMutation({
    mutationFn: () => requireClient().intake.poll({ projectId: project.id }),
    onSuccess: invalidateStatus,
  });
  const failure = save.error ?? poll.error;
  const update = (patch: Partial<IntakePolicy>): void => {
    save.mutate(patch);
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
  const polled = poll.data?.[0];
  const message =
    poll.data === undefined
      ? null
      : polled === undefined
        ? t("settings.intakeNothing")
        : `${t("settings.intakeReceived", {
            received: polled.received,
            duplicates: polled.duplicates,
          })}${
            polled.dryRun.length === 0
              ? ""
              : t("settings.intakeDryRun", { items: polled.dryRun.join("; ") })
          }`;

  const { intake } = project;
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3 text-xs">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={intake.enabled}
            onChange={(e) => {
              update({ enabled: e.target.checked });
            }}
          />
          {t("settings.intake")}
        </label>
        <Button
          disabled={poll.isPending}
          onClick={() => {
            poll.mutate();
          }}
        >
          {poll.isPending ? t("settings.intakePolling") : t("settings.intakePoll")}
        </Button>
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
      {failure === null ? null : <p className="text-red-400">{errorMessage(failure)}</p>}
    </div>
  );
}
