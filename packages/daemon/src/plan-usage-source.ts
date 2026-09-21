import type { PlanUsage, PlanWindow } from "@ho/protocol";
import { secrets } from "bun";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const BETA_HEADER = "oauth-2025-04-20";
const CLI_SERVICE = "Claude Code-credentials";
const REQUIRED_SCOPE = "user:profile";
const KEYCHAIN_TIMEOUT_MS = 5000;
const FETCH_TIMEOUT_MS = 15_000;

const SIGN_IN_EXPIRED =
  "the Claude Code login on this machine has expired; run claude once and it refreshes itself";
const SIGN_IN_MISSING =
  "Claude Code is not signed in on this machine; run claude and sign in with your subscription";

const Credentials = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string().min(1),
    expiresAt: z.number().optional(),
    scopes: z.array(z.string()).default([]),
  }),
});

const Window = z.object({
  utilization: z.number().nullable().optional(),
  resets_at: z.string().nullable().optional(),
});
const Limit = z.object({
  kind: z.string(),
  percent: z.number().nullable().optional(),
  resets_at: z.string().nullable().optional(),
});
const Body = z.object({
  five_hour: Window.nullable().optional(),
  seven_day: Window.nullable().optional(),
  limits: z.array(Limit).optional(),
});

export type PlanUsageOutcome =
  | { kind: "ok"; usage: PlanUsage }
  | { kind: "sign_in"; message: string }
  | { kind: "unavailable"; message: string };

type Token = { kind: "token"; value: string };

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const bounded = <T>(work: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error("the credential store did not answer"));
      }, ms).unref();
    }),
  ]);

async function readCliToken(): Promise<PlanUsageOutcome | Token> {
  const fromKeychain = await bounded(
    secrets.get({ service: CLI_SERVICE, name: userInfo().username }),
    KEYCHAIN_TIMEOUT_MS,
  ).catch(() => null);
  const raw =
    fromKeychain ??
    (await Bun.file(join(homedir(), ".claude", ".credentials.json"))
      .text()
      .catch(() => null));
  if (raw === null) {
    return { kind: "sign_in", message: SIGN_IN_MISSING };
  }
  const parsed = Credentials.safeParse(parseJson(raw));
  if (!parsed.success) {
    return { kind: "sign_in", message: SIGN_IN_MISSING };
  }
  const { accessToken, expiresAt, scopes } = parsed.data.claudeAiOauth;
  if (!scopes.includes(REQUIRED_SCOPE)) {
    return {
      kind: "sign_in",
      message: `the Claude Code login lacks the ${REQUIRED_SCOPE} scope; sign in again with claude auth login`,
    };
  }
  if (expiresAt !== undefined && expiresAt <= Date.now()) {
    return { kind: "sign_in", message: SIGN_IN_EXPIRED };
  }
  return { kind: "token", value: accessToken };
}

const isoOrNull = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

const windowOf = (
  window: z.infer<typeof Window> | null | undefined,
  limit: z.infer<typeof Limit> | undefined,
): PlanWindow | null => {
  const percent = limit?.percent ?? window?.utilization ?? null;
  return percent === null
    ? null
    : { percent: Math.max(0, percent), resetsAt: isoOrNull(limit?.resets_at ?? window?.resets_at) };
};

const usageOf = (body: z.infer<typeof Body>, at: string): PlanUsage => {
  const limit = (kind: string): z.infer<typeof Limit> | undefined =>
    body.limits?.find((entry) => entry.kind === kind);
  return {
    at,
    fiveHour: windowOf(body.five_hour, limit("session")),
    sevenDay: windowOf(body.seven_day, limit("weekly_all")),
  };
};

async function fetchUsage(token: string, at: string): Promise<PlanUsageOutcome> {
  const response = await fetch(ENDPOINT, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": BETA_HEADER,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    return { kind: "sign_in", message: SIGN_IN_EXPIRED };
  }
  if (!response.ok) {
    return {
      kind: "unavailable",
      message: `the usage endpoint answered ${String(response.status)}`,
    };
  }
  const json: unknown = await response.json().catch(() => null);
  const body = Body.safeParse(json);
  return body.success
    ? { kind: "ok", usage: usageOf(body.data, at) }
    : {
        kind: "unavailable",
        message: "the usage endpoint answered in a shape this office does not know",
      };
}

export async function readPlanUsage(at: string): Promise<PlanUsageOutcome> {
  const token = await readCliToken();
  return token.kind === "token" ? fetchUsage(token.value, at) : token;
}
