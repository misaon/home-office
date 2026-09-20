import { type ReadModel, tasksOfMandate } from "@ho/core";
import type { Mandate, MandateStatus } from "@ho/protocol";
import { formatDuration, timingOf } from "./task-timing.ts";

const bold = (text: string): string => `**${text}**`;

const quote = (mandate: Mandate): string => `**“${mandate.title}”**`;

export const pullRequestLink = (url: string): string => {
  const number = /\/pull\/(?<number>\d+)/u.exec(url)?.groups?.["number"];
  return number === undefined ? `[pull request](${url})` : `pull request [#${number}](${url})`;
};

const verifiedCount = (mandate: Mandate): number =>
  mandate.acceptance.filter((_, index) =>
    mandate.evidence.some(
      (entry) =>
        entry.taskId === undefined &&
        entry.criterion === index &&
        entry.commit === mandate.artifacts.commit &&
        entry.method === "verification" &&
        entry.verdict === "pass",
    ),
  ).length;

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

const fulfilledLines = (model: ReadModel, mandate: Mandate, at: string): string => {
  const root = model.tasks.get(mandate.rootTaskId);
  const since = root === undefined ? null : timingOf(model, root, at).sinceRequestMs;
  const spent = tasksOfMandate(model, mandate).reduce(
    (sum, task) => {
      const timing = timingOf(model, task, at);
      return { agentMs: sum.agentMs + timing.agentMs, sessions: sum.sessions + timing.sessions };
    },
    { agentMs: 0, sessions: 0 },
  );
  const conditions = mandate.acceptance.length;
  const { prUrl, branch } = mandate.artifacts;
  return [
    `✅ Your request ${quote(mandate)} is done${conditions === 0 ? "" : `: ${String(verifiedCount(mandate))} of ${plural(conditions, "condition")} verified on the combined result`}.`,
    since === null
      ? ""
      : `⏱️ From the request to here: ${bold(formatDuration(since))}; ${plural(spent.sessions, "session")} spent ${formatDuration(spent.agentMs)} on it${mandate.round === 0 ? "" : ` across ${plural(mandate.round, "fix round")}`}.`,
    prUrl === undefined ? "" : `🔗 ${pullRequestLink(prUrl)}`,
    branch === undefined ? "" : `🌿 Branch \`${branch}\``,
  ]
    .filter((line) => line !== "")
    .join("\n");
};

export function mandateStatusLine(
  model: ReadModel,
  mandate: Mandate,
  to: MandateStatus,
  reason: string | undefined,
  at: string,
): string | null {
  if (to === "verifying") {
    const verifying = tasksOfMandate(model, mandate).findLast((task) => task.kind === "verify");
    const verifier =
      verifying?.assigneeId === undefined ? undefined : model.agents.get(verifying.assigneeId);
    return `🧪 Every task for ${quote(mandate)} is done; ${bold(verifier?.name ?? "a colleague")} is verifying the whole result against ${plural(mandate.acceptance.length, "condition")}.`;
  }
  if (to === "fulfilled") {
    return fulfilledLines(model, mandate, at);
  }
  if (to === "blocked") {
    return `🚧 ${quote(mandate)} is blocked${reason === undefined ? "" : `: ${reason}`}`;
  }
  return null;
}

export const roundLine = (mandate: Mandate, round: number, reason: string): string =>
  `🔁 Round ${String(round)} for ${quote(mandate)}: the combined result failed verification.\n${reason}`;
