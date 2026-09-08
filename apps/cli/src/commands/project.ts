import { type Command, subcommand } from "../command.ts";
import { resolve } from "node:path";
import {
  compact,
  type IntakePolicy,
  type PublishPolicy,
  type RepoInspection,
  type RepoSource,
} from "@ho/protocol";
import { list, parse, str } from "../args.ts";
import { type HoClient, withClient } from "../client.ts";
import { colour, line, result } from "../output.ts";
import { findAgent, findProject } from "./lookup.ts";

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
  const parsed = parse(argv, ["path", "url", "branch", "pr", "draft"], [], ["import"]);
  const inspection = await inspect(client, repoFrom(str(parsed, "path"), str(parsed, "url")));
  const branch = str(parsed, "branch");
  const publish = publishFrom(onOff(str(parsed, "pr")), onOff(str(parsed, "draft")));
  const importAgentIds = await Promise.all(
    list(parsed, "import").map(async (ref) => (await findAgent(client, ref)).id),
  );
  const created = await client.projects.create({
    name: parsed.positionals[0] ?? inspection.name,
    repo: inspection.repo,
    defaultBranch: branch ?? inspection.defaultBranch,
    ...compact({ publish }),
    importAgentIds,
  });
  result(
    `added floor ${colour.bold(created.name)} ${colour.dim(created.id)} on ${created.defaultBranch}${
      importAgentIds.length === 0
        ? ""
        : ` with ${String(importAgentIds.length)} imported character(s)`
    }`,
    created,
  );
}

async function project(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, projectCommand);
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
        const seen = await client.projects.inspect({
          repo: repoFrom(str(parsed, "path"), str(parsed, "url")),
        });
        result(
          seen.ok
            ? `${colour.ok("git repository")} ${colour.bold(seen.name)} on ${seen.defaultBranch}`
            : `${colour.bad("not usable")}: ${seen.message}`,
          seen,
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
        const updated = await client.projects.update({
          id: current.id,
          patch: compact({ defaultBranch: branch, publish, intake }),
        });
        result(
          `floor ${colour.bold(updated.name)}: branch ${updated.defaultBranch}, delivery ${updated.publish.mode}, intake ${updated.intake.enabled ? "on" : "off"}`,
          updated,
        );
        return;
      }
      case "rm": {
        const ref = rest[0];
        if (ref === undefined) {
          throw new Error("project reference is required");
        }
        const floor = await findProject(client, ref);
        result(
          `removed floor ${colour.bold(floor.name)} with its team`,
          await client.projects.remove({ id: floor.id }),
        );
        return;
      }
      default: {
        throw new Error(`unknown project command "${sub}"`);
      }
    }
  });
}

export const projectCommand: Command = {
  name: "project",
  summary:
    "floors in creation order; add takes a path or a git URL, --import copies characters from other floors, set changes the branch, delivery and GitHub intake",
  usage: [
    "  ho project list",
    "  ho project inspect (--path <dir> | --url <git-url>)",
    "  ho project add [name] (--path <dir> | --url <git-url>) [--branch main] [--pr on] [--draft off]",
    "               [--import <agent>]...",
    "  ho project set <floor> [--branch <name>] [--pr on|off] [--draft on|off]",
    "               [--intake on|off] [--labels a,b] [--interval <seconds>] [--dry-run on|off]",
    "  ho project rm <floor>",
  ],
  run: project,
};
