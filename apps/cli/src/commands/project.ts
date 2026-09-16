import {
  compact,
  OFFICE_DIR,
  OFFICE_FILE,
  type IntakePolicy,
  type PublishPolicy,
  type RepoInspection,
  type RepoSource,
  repoUrl,
} from "@ho/protocol";
import { resolve } from "node:path";
import { bool, int, list, onOff, str } from "../flags.ts";
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

const publishFrom = (
  pr: boolean | undefined,
  draft: boolean | undefined,
): Partial<PublishPolicy> | undefined =>
  pr === undefined && draft === undefined
    ? undefined
    : compact({ mode: pr === undefined ? undefined : pr ? "pull-request" : "branch", draft });

const intakeFrom = (flags: {
  intake: boolean | undefined;
  labels: string | undefined;
  interval: number | undefined;
  dryRun: boolean | undefined;
}): Partial<IntakePolicy> | undefined =>
  Object.values(flags).every((value) => value === undefined)
    ? undefined
    : compact({
        enabled: flags.intake,
        labels: flags.labels
          ?.split(",")
          .map((label) => label.trim())
          .filter((label) => label !== ""),
        intervalSeconds: flags.interval,
        dryRun: flags.dryRun,
      });

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
    "floors in creation order; add takes a path or a git URL, --import copies characters from other floors, set changes the branch, delivery and GitHub intake, sync and export move the floor between the office and its own .ho/config.json",
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
        const publish = publishFrom(onOff(str(parsed, "pr")), onOff(str(parsed, "draft")));
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
        verify: "<command>",
        labels: "a,b",
        interval: "<seconds>",
        "dry-run": "on|off",
      },
      run: async (parsed, client) => {
        const rpc = await client();
        const current = await findProject(rpc, parsed.positionals[0] ?? "");
        const command = str(parsed, "verify");
        const updated = await rpc.projects.update({
          id: current.id,
          patch: compact({
            defaultBranch: str(parsed, "branch"),
            verify: command === undefined ? undefined : { command },
            publish: publishFrom(onOff(str(parsed, "pr")), onOff(str(parsed, "draft"))),
            intake: intakeFrom({
              intake: onOff(str(parsed, "intake")),
              labels: str(parsed, "labels"),
              interval: int(parsed, "interval"),
              dryRun: onOff(str(parsed, "dry-run")),
            }),
          }),
        });
        return output(
          [
            `floor ${colour.bold(updated.name)}: branch ${updated.defaultBranch}, delivery ${updated.publish.mode}, intake ${updated.intake.enabled ? "on" : "off"}, checks ${updated.verify.command === "" ? "off" : updated.verify.command}`,
          ],
          updated,
        );
      },
    },
    sync: {
      positionals: ["<floor>"],
      booleans: ["dry-run"],
      run: async (parsed, client) => {
        const rpc = await client();
        const floor = await findProject(rpc, parsed.positionals[0] ?? "");
        const dryRun = bool(parsed, "dry-run");
        const result = await rpc.projects.sync({ id: floor.id, dryRun });
        const head =
          result.source === null
            ? `${colour.dim(`${OFFICE_DIR}/${OFFICE_FILE}`)} not found in ${colour.bold(floor.name)}`
            : `${colour.bold(floor.name)} ← ${colour.dim(result.source)}${dryRun ? colour.dim(" (dry run)") : ""}`;
        const body =
          result.changes.length === 0 && result.problems.length === 0
            ? [colour.dim("  nothing to change")]
            : [
                ...result.changes.map((change) => `  ${change}`),
                ...result.problems.map((problem) => `  ${colour.bad(problem)}`),
              ];
        return output([head, ...body], result);
      },
    },
    export: {
      positionals: ["<floor>"],
      run: async (parsed, client) => {
        const rpc = await client();
        const floor = await findProject(rpc, parsed.positionals[0] ?? "");
        const written = await rpc.projects.export({ id: floor.id });
        return output(
          [`wrote ${colour.bold(written.path)} ${colour.dim(`(${String(written.bytes)} bytes)`)}`],
          written,
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
