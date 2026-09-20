import {
  type AcceptancePolicy,
  type EnvironmentPolicy,
  environmentDescribed,
  type IntakePolicy,
  type OfficeFile,
  type OfficeFileSync,
  type Project,
  type ProjectId,
  type PublishPolicy,
  type ServicesPolicy,
  type VerifyPolicy,
} from "@ho/protocol";
import { withProject } from "./commands/shared.ts";
import type { ReadModel } from "./model/read-model.ts";
import { jsonEqual } from "./office-file.ts";
import { type Plan, planRoster } from "./office-file-roster.ts";
import { type CommandContext, type CommandResult, ok } from "./result.ts";

const publishText = (p: PublishPolicy): string =>
  `${p.mode}${p.mode === "pull-request" && p.draft ? " (draft)" : ""}`;

const intakeText = (p: IntakePolicy): string => {
  const labels = p.labels.length === 0 ? "" : ` [${p.labels.join(", ")}]`;
  return p.enabled
    ? `on/${String(p.intervalSeconds)}s${labels}${p.dryRun ? " (dry run)" : ""}`
    : `off${labels}`;
};

const servicesText = (p: ServicesPolicy): string => (p.enabled ? p.mode : "off");

const verifyText = (p: VerifyPolicy): string =>
  p.command === ""
    ? "off"
    : `\`${p.command}\` (${String(p.timeoutSeconds)}s, ${String(p.maxAttempts)} attempts)`;

const acceptanceText = (p: AcceptancePolicy): string =>
  `${p.verify}, ${String(p.maxFixRounds)} fix round(s)`;

const environmentText = (p: EnvironmentPolicy): string =>
  environmentDescribed(p)
    ? `${String(p.setup.length + p.services.length + p.seed.length)} setup command(s), ${String(Object.keys(p.checks).length)} check(s)${p.run === undefined ? "" : ", runs the app"}`
    : "off";

const projectNameTaken = (model: ReadModel, name: string, except: ProjectId): boolean =>
  [...model.projects.values()].some(
    (p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase(),
  );

function planProject(
  model: ReadModel,
  project: Project,
  file: OfficeFile,
  ctx: CommandContext,
  plan: Plan,
): void {
  const patch: Partial<Project> = {};
  if (file.name !== undefined && file.name !== project.name) {
    if (projectNameTaken(model, file.name, project.id)) {
      plan.problems.push(`another floor is already called "${file.name}"`);
    } else {
      patch.name = file.name;
      plan.changes.push(`name: ${project.name} → ${file.name}`);
    }
  }
  if (file.defaultBranch !== undefined && file.defaultBranch !== project.defaultBranch) {
    patch.defaultBranch = file.defaultBranch;
    plan.changes.push(`branch: ${project.defaultBranch} → ${file.defaultBranch}`);
  }
  if (file.publish !== undefined && !jsonEqual(file.publish, project.publish)) {
    patch.publish = file.publish;
    plan.changes.push(`publish: ${publishText(project.publish)} → ${publishText(file.publish)}`);
  }
  if (file.intake !== undefined && !jsonEqual(file.intake, project.intake)) {
    patch.intake = file.intake;
    plan.changes.push(`intake: ${intakeText(project.intake)} → ${intakeText(file.intake)}`);
  }
  if (file.services !== undefined && !jsonEqual(file.services, project.services)) {
    patch.services = file.services;
    plan.changes.push(
      `services: ${servicesText(project.services)} → ${servicesText(file.services)}`,
    );
  }
  if (file.verify !== undefined && !jsonEqual(file.verify, project.verify)) {
    patch.verify = file.verify;
    plan.changes.push(`verify: ${verifyText(project.verify)} → ${verifyText(file.verify)}`);
  }
  if (file.acceptance !== undefined && !jsonEqual(file.acceptance, project.acceptance)) {
    patch.acceptance = file.acceptance;
    plan.changes.push(
      `acceptance: ${acceptanceText(project.acceptance)} → ${acceptanceText(file.acceptance)}`,
    );
  }
  if (file.environment !== undefined && !jsonEqual(file.environment, project.environment)) {
    patch.environment = file.environment;
    plan.changes.push(
      `environment: ${environmentText(project.environment)} → ${environmentText(file.environment)}`,
    );
  }
  if (Object.keys(patch).length === 0) {
    return;
  }
  plan.events.push({
    type: "project.updated",
    actor: ctx.actor,
    payload: { project: { ...project, ...patch, updatedAt: ctx.now } },
  });
}

export type OfficeFileOrigin = { source: string | null; dryRun: boolean };

export function applyOfficeFile(
  model: ReadModel,
  projectId: ProjectId,
  file: OfficeFile,
  origin: OfficeFileOrigin,
  ctx: CommandContext,
): CommandResult<OfficeFileSync> {
  return withProject(model, projectId, (project) => {
    const plan: Plan = { events: [], changes: [], problems: [] };
    planProject(model, project, file, ctx, plan);
    if (file.agents !== undefined) {
      planRoster(model, project, file.agents, file.budgets, ctx, plan);
    }
    const applied = !origin.dryRun && plan.events.length > 0;
    return ok({
      events: origin.dryRun ? [] : plan.events,
      read: () => ({
        projectId,
        source: origin.source,
        applied,
        changes: plan.changes,
        problems: plan.problems,
      }),
    });
  });
}
