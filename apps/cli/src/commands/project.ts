import { resolve } from "node:path";
import {
  compact,
  type IntakePolicy,
  type PublishPolicy,
  type RepoInspection,
  type RepoSource,
} from "@ho/protocol";
import { parse, str } from "../args.ts";
import { type HoClient, withClient } from "../client.ts";
import { line, print } from "../output.ts";
import { findAgent, findProject } from "./lookup.ts";
import { subcommand } from "./help.ts";

const repoFrom = (path: string | undefined, url: string | undefined): RepoSource => {
  if (path !== undefined && url !== undefined) {
    throw new Error("choose exactly one of --path and --url");
  }
  if (path !== undefined) {
    return { kind: "local", path: resolve(path) };
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

/** `--import` may repeat; parseArgs keeps only the last value, so repeats are collected by hand. */
const splitImports = (argv: readonly string[]): { imports: string[]; remaining: string[] } => {
  const imports: string[] = [];
  const remaining: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--import" && next !== undefined) {
      imports.push(next);
      i += 1;
    } else if (arg !== undefined) {
      remaining.push(arg);
    }
  }
  return { imports, remaining };
};

/** Asks the daemon what the repository is (git, name, default branch) before it becomes a floor. */
const inspect = async (
  client: HoClient,
  repo: RepoSource,
): Promise<Extract<RepoInspection, { ok: true }>> => {
  const inspection = await client.projects.inspect({ repo });
  if (!inspection.ok) {
    throw new Error(inspection.message);
  }
  return inspection;
};

async function add(client: HoClient, argv: readonly string[]): Promise<void> {
  const { imports, remaining } = splitImports(argv);
  const parsed = parse(remaining, ["path", "url", "branch", "pr", "draft"]);
  const inspection = await inspect(client, repoFrom(str(parsed, "path"), str(parsed, "url")));
  const branch = str(parsed, "branch");
  const publish = publishFrom(onOff(str(parsed, "pr")), onOff(str(parsed, "draft")));
  const importAgentIds = await Promise.all(
    imports.map(async (ref) => (await findAgent(client, ref)).id),
  );
  print(
    await client.projects.create({
      name: parsed.positionals[0] ?? inspection.name,
      repo: inspection.repo,
      defaultBranch: branch ?? inspection.defaultBranch,
      ...compact({ publish }),
      importAgentIds,
    }),
  );
}

export async function project(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "project");
  await withClient(async (client) => {
    switch (sub) {
      case "list": {
        const projects = (await client.projects.list()).toSorted(
          (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
        for (const [i, p] of projects.entries()) {
          const source = p.repo.kind === "local" ? p.repo.path : p.repo.url;
          line(
            `floor ${String(i + 1)}  ${p.id}  ${p.name}  ${source}  [${p.defaultBranch}]  publish=${p.publish.mode}${p.publish.mode === "pull-request" && p.publish.draft ? " (draft)" : ""}${p.intake.enabled ? `  intake=on/${String(p.intake.intervalSeconds)}s${p.intake.dryRun ? " (dry run)" : ""}` : ""}`,
          );
        }
        return;
      }
      case "inspect": {
        const parsed = parse(rest, ["path", "url"]);
        print(
          await client.projects.inspect({
            repo: repoFrom(str(parsed, "path"), str(parsed, "url")),
          }),
        );
        return;
      }
      case "add": {
        await add(client, rest);
        return;
      }
      case "set": {
        const parsed = parse(rest, [
          "branch",
          "pr",
          "draft",
          "intake",
          "labels",
          "interval",
          "dry-run",
        ]);
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
            patch: compact({ defaultBranch: branch, publish, intake }),
          }),
        );
        return;
      }
      case "rm": {
        const ref = rest[0];
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
