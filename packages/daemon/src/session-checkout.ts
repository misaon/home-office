import { dependenciesOf, type ReadModel } from "@ho/core";
import type { CommitSha, Task } from "@ho/protocol";
import {
  inRepo,
  inspectWorkingTree,
  prepareRepo,
  prepareReviewCheckout,
  run,
} from "./git-bridge.ts";
import type { DiffSummary, WorkBase } from "./prompts-shared.ts";
import type { SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";
import { LANGUAGE_MARKERS, languagesOf, type RepositoryLanguage } from "./skill-pack.ts";

const baseOf = (model: ReadModel, task: Task): WorkBase | null => {
  const landed = dependenciesOf(model, task)
    .filter((dependency) => dependency.status === "done")
    .flatMap((dependency) =>
      dependency.artifacts.branch === undefined
        ? []
        : [
            {
              title: dependency.title,
              branch: dependency.artifacts.branch,
              commit: dependency.artifacts.commit ?? null,
              updatedAt: dependency.updatedAt,
            },
          ],
    )
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [first] = landed;
  return first === undefined
    ? null
    : {
        title: first.title,
        branch: first.branch,
        commit: first.commit,
        others: landed.slice(1).map((dependency) => dependency.branch),
      };
};

export type Checkout = {
  commit: CommitSha | null;
  base: WorkBase | null;
  diff: DiffSummary | null;
  languages: readonly RepositoryLanguage[];
};

const MARKER_PATHSPECS = Object.values(LANGUAGE_MARKERS)
  .flat()
  .flatMap((marker) => [marker, `*/${marker}`]);

const languagesIn = async (deps: SessionDeps, volume: string): Promise<RepositoryLanguage[]> => {
  const result = await run(
    deps.provider,
    inRepo(deps.config, volume, "markers", ["ls-files", "--", ...MARKER_PATHSPECS]),
  );
  return result.ok ? languagesOf(result.stdout.split("\n").filter((line) => line !== "")) : [];
};

const SHORTSTAT =
  /(?<files>\d+) files? changed(?:, (?<insertions>\d+) insertions?\(\+\))?(?:, (?<deletions>\d+) deletions?\(-\))?/u;

const parseShortstat = (stdout: string): DiffSummary | null => {
  const groups = SHORTSTAT.exec(stdout)?.groups;
  if (groups?.["files"] === undefined) {
    return stdout.trim() === "" ? { files: 0, insertions: 0, deletions: 0 } : null;
  }
  return {
    files: Number(groups["files"]),
    insertions: Number(groups["insertions"] ?? "0"),
    deletions: Number(groups["deletions"] ?? "0"),
  };
};

export const diffSummary = async (
  deps: SessionDeps,
  volume: string,
  defaultBranch: string,
): Promise<DiffSummary | null> => {
  const result = await run(
    deps.provider,
    inRepo(deps.config, volume, "diffstat", ["diff", "--shortstat", `${defaultBranch}...HEAD`]),
  );
  return result.ok ? parseShortstat(result.stdout) : null;
};

export async function checkout(
  deps: SessionDeps,
  ctx: SessionContext,
  sourcePath: string,
  volume: string,
  branch: string,
): Promise<Checkout> {
  const source = { path: sourcePath, defaultBranch: ctx.project.defaultBranch };
  if (ctx.session.mode === "review" || ctx.session.mode === "verify") {
    const candidate = ctx.task.artifacts.commit ?? null;
    if (candidate === null) {
      deps.log.warn(
        { sessionId: ctx.session.id, taskId: ctx.task.id, branch },
        "the task carries no verified commit; reviewing the tip of its branch",
      );
    }
    const commit = await prepareReviewCheckout(
      deps.provider,
      deps.config,
      source,
      volume,
      branch,
      candidate,
    );
    const diff = await diffSummary(deps, volume, ctx.project.defaultBranch);
    return { commit, base: null, diff, languages: await languagesIn(deps, volume) };
  }
  const base = ctx.session.mode === "work" ? baseOf(deps.office.model, ctx.task) : null;
  await prepareRepo(deps.provider, deps.config, source, volume, branch, {
    branch: base?.branch ?? ctx.project.defaultBranch,
    alsoFetch: base?.others ?? [],
  });
  const tree = await inspectWorkingTree(deps.provider, deps.config, volume).catch(() => null);
  return {
    commit: tree?.sha ?? null,
    base,
    diff: null,
    languages: await languagesIn(deps, volume),
  };
}
