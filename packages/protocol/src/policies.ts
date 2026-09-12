// Per-project policies: how work leaves a floor, where its mail comes from, what its tasks may run.
import { z } from "zod";

/** How finished work leaves the sandbox: a branch in the repository, or additionally a GitHub pull request via `gh`. */
export const PublishPolicy = z.object({
  mode: z.enum(["branch", "pull-request"]).default("branch"),
  draft: z.boolean().default(true),
});
export type PublishPolicy = z.infer<typeof PublishPolicy>;

/** Where mail comes from: `github-issues` today; Jira and Linear connectors register their own ids later. */
export const MailConnector = z.string().min(1).max(40);
export type MailConnector = z.infer<typeof MailConnector>;
export const GITHUB_ISSUES_CONNECTOR = "github-issues";

/** GitHub Issues intake of one project: the postman brings matching open issues to the boss. */
export const IntakePolicy = z.object({
  enabled: z.boolean().default(false),
  intervalSeconds: z.int().min(30).max(3600).default(120),
  /** Only issues carrying every listed label are taken; empty takes every open issue. */
  labels: z.array(z.string().min(1).max(50)).default([]),
  /** Poll and report what would arrive without creating tasks or touching the issues. */
  dryRun: z.boolean().default(false),
  /** Label added to issues the office took; empty disables labelling. */
  ackLabel: z.string().max(50).default("home-office"),
  /** Comment on the issue when it is received, delegated and finished. */
  comment: z.boolean().default(true),
});
export type IntakePolicy = z.infer<typeof IntakePolicy>;

/**
 * Whether a task of this project gets its own container engine, so the repository's own
 * `docker-compose.yml` runs inside the sandbox instead of on the daemon's engine. `rootless` runs that
 * engine as a non-root user inside a user namespace, at the price of unenforced per-service cgroup
 * limits; `rootful` buys full Compose fidelity and makes a successful escape root in the Docker VM.
 */
export const ServicesPolicy = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["rootless", "rootful"]).default("rootless"),
});
export type ServicesPolicy = z.infer<typeof ServicesPolicy>;
