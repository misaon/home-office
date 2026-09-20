import type { ReadModel } from "@ho/core";
import { type Baseline, clip, type EnvironmentPolicy } from "@ho/protocol";
import { APP_LOG, type EnvironmentReport, type StepReport } from "./environment-report.ts";
import type { SessionFacts } from "./prompts-shared.ts";

const TAIL_IN_PROMPT = 500;
const COMMIT_CHARS = 12;

const seconds = (ms: number): string => `${String(Math.max(1, Math.round(ms / 1000)))} s`;

const stepLine = (step: StepReport): string =>
  step.ok
    ? `\`${step.command}\` ok in ${seconds(step.ms)}`
    : `\`${step.command}\` failed (exit ${step.exitCode === null ? "none" : String(step.exitCode)}): ${clip(step.tail, TAIL_IN_PROMPT)}`;

const preparedGuide = (report: EnvironmentReport | null): string => {
  if (report === null) {
    return "";
  }
  const failed = report.steps.some((step) => !step.ok);
  const { application } = report;
  const applicationLine =
    application === null
      ? ""
      : application.ready
        ? ` The application is running: the office started \`${application.command}\`${application.url === null ? "" : ` and it answers at ${application.url}`}; its output is in ${APP_LOG}. Do not start it again.`
        : ` The office started \`${application.command}\`, but it did not answer within the ready timeout: ${clip(application.tail, TAIL_IN_PROMPT)}. Read ${APP_LOG} before you start anything yourself.`;
  return `Environment: the office prepared this checkout before you started — ${report.steps.map((step) => stepLine(step)).join("; ")}.${failed ? " A failed step is the environment's fault, not your task's: fix it only when your work needs it, otherwise name it in your report." : ""}${applicationLine}`;
};

const checksGuide = (policy: EnvironmentPolicy): string => {
  const entries = Object.entries(policy.checks);
  return entries.length === 0
    ? ""
    : `Named checks of this project: ${entries.map(([name, command]) => `${name} → \`${command}\``).join("; ")}. Run the ones your change touches before you report.`;
};

const baselineGuide = (baseline: Baseline | undefined, defaultBranch: string): string => {
  if (baseline === undefined) {
    return "";
  }
  const head = `Baseline: before this request started, ${defaultBranch} at ${baseline.commit.slice(0, COMMIT_CHARS)} was set up and checked in this same environment.`;
  if (!baseline.setup.ok) {
    return `${head} The setup itself failed there: ${clip(baseline.setup.tail, TAIL_IN_PROMPT)}. Expect the environment to need attention before anything runs.`;
  }
  const failed = baseline.checks.filter((check) => !check.ok);
  if (failed.length === 0) {
    return `${head} Every check passed there, so a failure now is a regression of this request.`;
  }
  return `${head} These checks already failed there: ${failed
    .map((check) => `${check.name} (\`${check.command}\`): ${clip(check.tail, TAIL_IN_PROMPT)}`)
    .join(
      "; ",
    )}. A failure identical to these is pre-existing and not yours unless the task says so; anything new is a regression.`;
};

export const environmentGuide = (f: SessionFacts, model: ReadModel): string => {
  const mandate = f.task.mandateId === undefined ? undefined : model.mandates.get(f.task.mandateId);
  return [
    preparedGuide(f.environment),
    checksGuide(f.project.environment),
    baselineGuide(mandate?.baseline, f.project.defaultBranch),
  ]
    .filter((line) => line !== "")
    .join("\n");
};
