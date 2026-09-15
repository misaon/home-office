import {
  compact,
  type IntakePolicy,
  type PublishPolicy,
  type RepoInspection,
  type RepoSource,
  repoUrl,
} from "@ho/protocol";
import { resolve } from "node:path";
import { int, list, onOff, str } from "../flags.ts";
import type { HoClient } from "../client.ts";
import { type Command, output } from "../cli.ts";
import { colour } from "../output.ts";
import { findAgent, findProject, sortedProjects } from "./lookup.ts";

const repoFrom = (path: string | undefined, url: string | undefined): RepoSource => {
  if (path !== undefined && url !== undefined) {
    throw new Error("choose exactly one of --path and --url");
  }
  if (path !== undefined) {
    return { kind: "local", path: resolve(path) };
  }
  if (url !== undefined) {
    return { kind: "git", url: repoUrl(url) };
  }
  throw new Error("--path or --url is required");
};

const DEFAULT_PUBLISH: PublishPolicy = { mode: "branch", draft: true };

const publishFrom = (
  pr: boolean | undefined,
  draft: boolean | undefined,
  current: PublishPolicy,
): PublishPolicy | undefined =>
  pr === undefined && draft === undefined
    ? undefined
    : {
        mode: pr === undefined ? current.mode : pr ? "pull-request" : "branch",
        draft: draft ?? current.draft,
      };

const intakeFrom = (
  flags: {
    intake: boolean | undefined;
    labels: string | undefined;
    interval: number | undefined;
    dryRun: boolean | undefined;
  },
  current: IntakePolicy,
): IntakePolicy | undefined =>
  Object.values(flags).every((value) => value === undefined)
    ? undefined
    : {
        ...current,
        enabled: flags.intake ?? current.enabled,
        labels:
          flags.labels === undefined
            ? current.labels
            : flags.labels
                .split(",")
                .map((l) => l.trim())
                .filter((l) => l !== ""),
        intervalSeconds: flags.interval ?? current.intervalSeconds,
        dryRun: flags.dryRun ?? current.dryRun,
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

const describe = (
  p: Awaited<ReturnType<HoClient["projects"]["list"]>>[number],
  i: number,
): string =>
  `floor ${String(i + 1)}  ${p.id}  ${p.name}  ${p.repo.kind === "local" ? p.repo.path : p.repo.url}  [${p.defaultBranch}]  publish=${p.publish.mode}${p.publish.mode === "pull-request" && p.publish.draft ? " (draft)" : ""}${p.intake.enabled ? `  intake=on/${String(p.intake.intervalSeconds)}s${p.intake.dryRun ? " (dry run)" : ""}` : ""}`;

export const projectCommand: Command = {
  name: "project",
  summary:
    "floors in creation order; add takes a path or a git URL, --import copies characters from other floors, set changes the branch, delivery and GitHub intake",
  subcommands: {
    list: {
      run: async (_parsed, client) => {
        const projects = await sortedProjects(await client());
        return output(
          projects.map((p, i) => describe(p, i)),
          projects,
        );
      },
    },
    inspect: {
      strings: { path: "<dir>", url: "<git-url>" },
      run: async (parsed, client) => {
        const rpc = await client();
        const seen = await rpc.projects.inspect({
          repo: repoFrom(str(parsed, "path"), str(parsed, "url")),
        });
        return output(
          [
            seen.ok
              ? `${colour.ok("git repository")} ${colour.bold(seen.name)} on ${seen.defaultBranch}`
              : `${colour.bad("not usable")}: ${seen.message}`,
          ],
          seen,
        );
      },
    },
    add: {
      positionals: ["[name]"],
      strings: { path: "<dir>", url: "<git-url>", branch: "<name>", pr: "on|off", draft: "on|off" },
      repeatable: { import: "<agent>" },
      run: async (parsed, client) => {
        const rpc = await client();
        const inspection = await inspect(rpc, repoFrom(str(parsed, "path"), str(parsed, "url")));
        const publish = publishFrom(
          onOff(str(parsed, "pr")),
          onOff(str(parsed, "draft")),
          DEFAULT_PUBLISH,
        );
        const importAgentIds = await Promise.all(
          list(parsed, "import").map(async (ref) => {
            const agent = await findAgent(rpc, ref);
            return agent.id;
          }),
        );
        const created = await rpc.projects.create({
          name: parsed.positionals[0] ?? inspection.name,
          repo: inspection.repo,
          defaultBranch: str(parsed, "branch") ?? inspection.defaultBranch,
          ...compact({ publish }),
          importAgentIds,
        });
        return output(
          [
            `added floor ${colour.bold(created.name)} ${colour.dim(created.id)} on ${created.defaultBranch}${importAgentIds.length === 0 ? "" : ` with ${String(importAgentIds.length)} imported character(s)`}`,
          ],
          created,
        );
      },
    },
    set: {
      positionals: ["<floor>"],
      strings: {
        branch: "<name>",
        pr: "on|off",
        draft: "on|off",
        intake: "on|off",
        labels: "a,b",
        interval: "<seconds>",
        "dry-run": "on|off",
      },
      run: async (parsed, client) => {
        const rpc = await client();
        const current = await findProject(rpc, parsed.positionals[0] ?? "");
        const updated = await rpc.projects.update({
          id: current.id,
          patch: compact({
            defaultBranch: str(parsed, "branch"),
            publish: publishFrom(
              onOff(str(parsed, "pr")),
              onOff(str(parsed, "draft")),
              current.publish,
            ),
            intake: intakeFrom(
              {
                intake: onOff(str(parsed, "intake")),
                labels: str(parsed, "labels"),
                interval: int(parsed, "interval"),
                dryRun: onOff(str(parsed, "dry-run")),
              },
              current.intake,
            ),
          }),
        });
        return output(
          [
            `floor ${colour.bold(updated.name)}: branch ${updated.defaultBranch}, delivery ${updated.publish.mode}, intake ${updated.intake.enabled ? "on" : "off"}`,
          ],
          updated,
        );
      },
    },
    rm: {
      positionals: ["<floor>"],
      run: async (parsed, client) => {
        const rpc = await client();
        const floor = await findProject(rpc, parsed.positionals[0] ?? "");
        const removed = await rpc.projects.remove({ id: floor.id });
        return output([`removed floor ${colour.bold(floor.name)} with its team`], removed);
      },
    },
  },
};
