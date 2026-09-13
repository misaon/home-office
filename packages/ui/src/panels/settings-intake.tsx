import type { IntakePolicy, IntakeStatus, Project } from "@ho/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button, CONTROL_DENSE, Failure, Switch } from "../kit/controls.tsx";
import { intakeStatusQuery } from "../queries.ts";
import { requireClient } from "../rpc.ts";
import { useOnline } from "../store.ts";

const when = (iso: string | null, t: TFunction): string =>
  iso === null ? t("settings.intakeNever") : new Date(iso).toLocaleTimeString();

const parseLabels = (text: string): string[] =>
  text
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label !== "");

const MIN_INTERVAL_S = 30;
const MAX_INTERVAL_S = 3600;

type FieldsProps = { intake: IntakePolicy; update: (patch: Partial<IntakePolicy>) => void };

/** Text fields commit when they lose focus and follow the policy again when it changes elsewhere. */
function IntakeFields({ intake, update }: FieldsProps): React.JSX.Element {
  const { t } = useTranslation();
  const labels = intake.labels.join(", ");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-2xs text-muted">
        <span>{t("settings.intakeEvery")}</span>
        <input
          key={intake.intervalSeconds}
          type="number"
          min={MIN_INTERVAL_S}
          max={MAX_INTERVAL_S}
          aria-label={t("settings.intakeEvery")}
          className={`${CONTROL_DENSE} w-16`}
          defaultValue={intake.intervalSeconds}
          onBlur={(e) => {
            const seconds = Number(e.target.value);
            if (
              Number.isInteger(seconds) &&
              seconds >= MIN_INTERVAL_S &&
              seconds <= MAX_INTERVAL_S &&
              seconds !== intake.intervalSeconds
            ) {
              update({ intervalSeconds: seconds });
            }
          }}
        />
        <span>{t("settings.intakeSeconds")}</span>
        <span className="ml-3">{t("settings.intakeAckLabel")}</span>
        <input
          key={intake.ackLabel}
          aria-label={t("settings.intakeAckLabel")}
          className={`${CONTROL_DENSE} w-28 font-mono`}
          defaultValue={intake.ackLabel}
          onBlur={(e) => {
            const ackLabel = e.target.value.trim();
            if (ackLabel !== intake.ackLabel) {
              update({ ackLabel });
            }
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-2xs text-muted">
        <span className="shrink-0">{t("settings.intakeLabels")}</span>
        <input
          key={labels}
          className={`${CONTROL_DENSE} min-w-0 flex-1 font-mono`}
          placeholder={t("settings.intakeAllIssues")}
          defaultValue={labels}
          onBlur={(e) => {
            const parsed = parseLabels(e.target.value);
            if (parsed.join(",") !== intake.labels.join(",")) {
              update({ labels: parsed });
            }
          }}
        />
      </label>
      <Switch
        checked={intake.comment}
        label={t("settings.intakeComment")}
        hint={t("settings.intakeCommentHint")}
        onChange={(comment) => {
          update({ comment });
        }}
      />
      <Switch
        checked={intake.dryRun}
        label={t("settings.intakeDry")}
        hint={t("settings.intakeDryHint")}
        onChange={(dryRun) => {
          update({ dryRun });
        }}
      />
    </div>
  );
}

function IntakeHealth({ status }: { status: IntakeStatus | null }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (status === null) {
    return null;
  }
  return (
    <p className="text-2xs leading-relaxed text-faint">
      {t("settings.intakeLastPoll", { when: when(status.lastPollAt, t) })}
      {status.nextPollAt === null
        ? ""
        : t("settings.intakeNext", { when: when(status.nextPollAt, t) })}
      {", "}
      {t("settings.intakeReceivedTotal", { received: status.received })}
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
  const online = useOnline();
  const queries = useQueryClient();
  const all = useQuery({ ...intakeStatusQuery, enabled: online });
  const status: IntakeStatus | null =
    all.data?.find((entry) => entry.projectId === project.id) ?? null;
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
    <div className="space-y-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <Switch
          checked={intake.enabled}
          label={t("settings.intakeLabel")}
          hint={t("settings.intakeHint")}
          onChange={(enabled) => {
            save.mutate({ enabled });
          }}
        />
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
        update={(patch) => {
          save.mutate(patch);
        }}
      />
      <IntakeHealth status={status} />
      {message === null ? null : <p className="animate-fade text-2xs text-good">{message}</p>}
      <Failure error={save.error ?? poll.error} />
    </div>
  );
}
