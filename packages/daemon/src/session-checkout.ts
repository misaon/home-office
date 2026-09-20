import { dependenciesOf, type ReadModel } from "@ho/core";
import type { CommitSha, Task } from "@ho/protocol";
import { prepareRepo, prepareReviewCheckout } from "./git-bridge.ts";
import type { WorkBase } from "./prompts-shared.ts";
import type { SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";

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

export type Checkout = { commit: CommitSha | null; base: WorkBase | null };

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
    return { commit, base: null };
  }
  const base = ctx.session.mode === "work" ? baseOf(deps.office.model, ctx.task) : null;
  await prepareRepo(deps.provider, deps.config, source, volume, branch, {
    branch: base?.branch ?? ctx.project.defaultBranch,
    alsoFetch: base?.others ?? [],
  });
  return { commit: null, base };
}
