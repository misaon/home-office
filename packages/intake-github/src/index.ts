import type { Cancellation, IntakeConnector, IntakeItem } from "@ho/core";
import {
  GITHUB_ISSUES_CONNECTOR,
  type MailAck,
  type MailItem,
  type MailOutcome,
  type Project,
} from "@ho/protocol";
import { z } from "zod";
import { gh, ghTarget } from "./gh.ts";

const LIMIT = 50;
const COMMENT_MAX = 6000;

/** The subset of `gh issue list --json` fields the office reads. */
const IssueRow = z.object({
  number: z.int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  url: z.url(),
  author: z.object({ login: z.string() }).nullable(),
  labels: z.array(z.object({ name: z.string() })),
});
const IssueRows = z.array(IssueRow);

const toSignal = (cancel: Cancellation | undefined): AbortSignal | undefined => {
  if (cancel === undefined) {
    return undefined;
  }
  const controller = new AbortController();
  if (cancel.aborted) {
    controller.abort();
  } else {
    cancel.addEventListener("abort", () => {
      controller.abort();
    });
  }
  return controller.signal;
};

const CLOSING: Record<MailOutcome, (detail: string) => string> = {
  received: (detail) =>
    `📬 Home Office received this issue and queued it for triage.${detail === "" ? "" : `\n\n${detail}`}`,
  delegated: (detail) => `🗂️ Home Office delegated this issue: ${detail}`,
  done: (detail) => `✅ Home Office finished work on this issue.\n\n${detail}`,
  blocked: (detail) => `⏸️ Home Office paused on this issue and needs input:\n\n${detail}`,
  failed: (detail) => `❌ Home Office could not complete this issue.\n\n${detail}`,
};
const closing = (ack: MailAck): string => CLOSING[ack.outcome](ack.detail);

/**
 * GitHub Issues through the owner's `gh` CLI: open issues (optionally filtered by labels) become mail;
 * acknowledgements are comments and an optional label. Everything runs on the host, never in a sandbox.
 */
export function createGithubIssuesConnector(): IntakeConnector {
  return {
    id: GITHUB_ISSUES_CONNECTOR,
    poll: async (project: Project, cancel?: Cancellation): Promise<IntakeItem[]> => {
      const target = ghTarget(project);
      const args = [
        "issue",
        "list",
        ...target.args,
        "--state",
        "open",
        "--limit",
        String(LIMIT),
        "--json",
        "number,title,body,url,author,labels",
      ];
      for (const label of project.intake.labels) {
        args.push("--label", label);
      }
      const rows = IssueRows.parse(JSON.parse(await gh(args, target.cwd, toSignal(cancel))));
      return rows.map((row) => ({
        externalId: String(row.number),
        title: row.title,
        body: row.body ?? "",
        url: row.url,
        author: row.author?.login ?? "",
        labels: row.labels.map((l) => l.name),
      }));
    },
    acknowledge: async (
      project: Project,
      mail: MailItem,
      ack: MailAck,
      cancel?: Cancellation,
    ): Promise<void> => {
      const target = ghTarget(project);
      const signal = toSignal(cancel);
      if (project.intake.comment) {
        await gh(
          [
            "issue",
            "comment",
            mail.externalId,
            ...target.args,
            "--body",
            closing(ack).slice(0, COMMENT_MAX),
          ],
          target.cwd,
          signal,
        );
      }
      if (ack.outcome === "received" && project.intake.ackLabel !== "") {
        await gh(
          [
            "issue",
            "edit",
            mail.externalId,
            ...target.args,
            "--add-label",
            project.intake.ackLabel,
          ],
          target.cwd,
          signal,
        );
      }
    },
  };
}
