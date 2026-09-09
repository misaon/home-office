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

const COMMENT_MAX = 6000;

const IssueRow = z.object({
  number: z.int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.url(),
  user: z.object({ login: z.string() }).nullable(),
  labels: z.array(z.object({ name: z.string() })),
  pull_request: z.unknown().optional(),
});
const IssuePages = z.array(z.array(IssueRow));

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
      const repo =
        target.cwd === undefined
          ? target.args[1]
          : (
              await gh(
                ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
                target.cwd,
                cancel,
              )
            ).trim();
      if (repo === undefined || !/^[a-z0-9-]+\/[a-z0-9_.-]+$/iu.test(repo)) {
        throw new Error("invalid GitHub repository identity");
      }
      const labels =
        project.intake.labels.length === 0
          ? ""
          : `&labels=${encodeURIComponent(project.intake.labels.join(","))}`;
      const pages = IssuePages.parse(
        JSON.parse(
          await gh(
            [
              "api",
              "--paginate",
              "--slurp",
              `repos/${repo}/issues?state=open&per_page=100${labels}`,
            ],
            target.cwd,
            cancel,
          ),
        ),
      );
      const rows = pages.flat().filter((row) => row.pull_request === undefined);
      return rows.map((row) => ({
        externalId: String(row.number),
        title: row.title,
        body: row.body ?? "",
        url: row.html_url,
        author: row.user?.login ?? "",
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
          cancel,
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
          cancel,
        );
      }
    },
  };
}
