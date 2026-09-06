import type { IntakePolicy, PublishPolicy, RepoSource } from "@ho/protocol";
import { parse, str } from "../args.ts";
import { withClient } from "../client.ts";
import { line, print } from "../output.ts";
import { findProject } from "./lookup.ts";
import { subcommand } from "./help.ts";

const repoFrom = (path: string | undefined, url: string | undefined): RepoSource => {
  if (path !== undefined) {
    return { kind: "local", path };
  }
  if (url !== undefined) {
    return { kind: "git", url };
  }
  throw new Error("--path or --url is required");
};

const onOff = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === "on" || value === "off") {
    return value === "on";
  }
  throw new Error(`expected on|off, got "${value}"`);
};

const publishFrom = (
  pr: boolean | undefined,
  draft: boolean | undefined,
  current?: PublishPolicy,
): PublishPolicy | undefined => {
  if (pr === undefined && draft === undefined) {
    return undefined;
  }
  const base = current ?? { mode: "branch", draft: true };
  return {
    mode: pr === undefined ? base.mode : pr ? "pull-request" : "branch",
    draft: draft ?? base.draft,
  };
};

const intakeFrom = (
  flags: {
    intake: string | undefined;
    labels: string | undefined;
    interval: string | undefined;
    dryRun: string | undefined;
  },
  current: IntakePolicy,
): IntakePolicy | undefined => {
  if (
    flags.intake === undefined &&
    flags.labels === undefined &&
    flags.interval === undefined &&
    flags.dryRun === undefined
  ) {
    return undefined;
  }
  const interval = flags.interval === undefined ? undefined : Number(flags.interval);
  if (interval !== undefined && !Number.isInteger(interval)) {
    throw new Error(`--interval expects whole seconds, got "${flags.interval ?? ""}"`);
  }
  return {
    ...current,
    enabled: onOff(flags.intake) ?? current.enabled,
    labels:
      flags.labels === undefined
        ? current.labels
        : flags.labels
            .split(",")
            .map((l) => l.trim())
            .filter((l) => l !== ""),
    intervalSeconds: interval ?? current.intervalSeconds,
    dryRun: onOff(flags.dryRun) ?? current.dryRun,
  };
};

export async function project(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "project");
  const parsed = parse(rest, [
    "path",
    "url",
    "branch",
    "pr",
    "draft",
    "intake",
    "labels",
    "interval",
    "dry-run",
  ]);
  await withClient(async (client) => {
    switch (sub) {
      case "list": {
        for (const p of await client.projects.list()) {
          const source =
            p.repo.kind === "local" ? p.repo.path : p.repo.kind === "git" ? p.repo.url : "(office)";
          line(
            `${p.id}  ${p.name}  ${source}  [${p.defaultBranch}]  publish=${p.publish.mode}${p.publish.mode === "pull-request" && p.publish.draft ? " (draft)" : ""}${p.intake.enabled ? `  intake=on/${String(p.intake.intervalSeconds)}s${p.intake.dryRun ? " (dry run)" : ""}` : ""}`,
          );
        }
        return;
      }
      case "add": {
        const name = parsed.positionals[0];
        if (name === undefined) {
          throw new Error("project name is required");
        }
        const repo = repoFrom(str(parsed, "path"), str(parsed, "url"));
        const branch = str(parsed, "branch");
        const publish = publishFrom(onOff(str(parsed, "pr")), onOff(str(parsed, "draft")));
        print(
          await client.projects.create({
            name,
            repo,
            ...(branch === undefined ? {} : { defaultBranch: branch }),
            ...(publish === undefined ? {} : { publish }),
          }),
        );
        return;
      }
      case "set": {
        const ref = parsed.positionals[0];
        if (ref === undefined) {
          throw new Error("project reference is required");
        }
        const current = await findProject(client, ref);
        const branch = str(parsed, "branch");
        const publish = publishFrom(
          onOff(str(parsed, "pr")),
          onOff(str(parsed, "draft")),
          current.publish,
        );
        const intake = intakeFrom(
          {
            intake: str(parsed, "intake"),
            labels: str(parsed, "labels"),
            interval: str(parsed, "interval"),
            dryRun: str(parsed, "dry-run"),
          },
          current.intake,
        );
        print(
          await client.projects.update({
            id: current.id,
            patch: {
              ...(branch === undefined ? {} : { defaultBranch: branch }),
              ...(publish === undefined ? {} : { publish }),
              ...(intake === undefined ? {} : { intake }),
            },
          }),
        );
        return;
      }
      case "rm": {
        const ref = parsed.positionals[0];
        if (ref === undefined) {
          throw new Error("project reference is required");
        }
        print(await client.projects.remove({ id: (await findProject(client, ref)).id }));
        return;
      }
      default: {
        throw new Error(`unknown project command "${sub}"`);
      }
    }
  });
}
