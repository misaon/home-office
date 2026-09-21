import { type ReadModel, recordSessionPlan } from "@ho/core";
import {
  errorMessage,
  isSessionActive,
  type PlanUsage,
  type PlanUsageStatus,
  type Session,
  type SessionId,
  type StoredEvent,
  SYSTEM_ACTOR,
  type Usage,
} from "@ho/protocol";
import type { Logger } from "./logger.ts";
import { followEvents, type Office } from "./office.ts";
import { type PlanUsageOutcome, readPlanUsage } from "./plan-usage-source.ts";

const ACTIVE_POLL_MS = 60_000;
const IDLE_POLL_MS = 600_000;
const SETTLE_POLL_MS = 10_000;
const CACHE_READ_WEIGHT = 0.1;
const SHARE_DECIMALS = 100;

type Tracked = { tokens: number; share: number; ended: boolean };

const weightOf = (usage: Usage): number =>
  usage.inputTokens +
  usage.outputTokens +
  usage.cacheWriteTokens +
  usage.cacheReadTokens * CACHE_READ_WEIGHT;

const onPlan = (model: ReadModel, session: Session): boolean => {
  const agent = model.agents.get(session.agentId);
  return agent?.provider === "claude-code" && agent.auth === "subscription";
};

const anyonePlanned = (model: ReadModel): boolean =>
  [...model.agents.values()].some(
    (agent) => agent.provider === "claude-code" && agent.auth === "subscription",
  );

const rounded = (share: number): number => Math.round(share * SHARE_DECIMALS) / SHARE_DECIMALS;

export class PlanUsageMeter {
  readonly #office: Office;
  readonly #log: Logger;
  readonly #enabled: boolean;
  readonly #tracked = new Map<SessionId, Tracked>();
  #last: PlanUsage | null = null;
  #status: PlanUsageStatus = { kind: "off", reason: "the meter has not started" };
  #timer: ReturnType<typeof setTimeout> | null = null;
  #following: { stop: () => Promise<void> } | null = null;
  #polling: Promise<void> | null = null;
  #stopped = false;

  constructor(office: Office, log: Logger, enabled: boolean) {
    this.#office = office;
    this.#log = log;
    this.#enabled = enabled;
  }

  status(): PlanUsageStatus {
    return this.#status;
  }

  start(): void {
    if (!this.#enabled) {
      this.#status = { kind: "off", reason: "plan.enabled is false in the daemon configuration" };
      return;
    }
    for (const session of this.#office.model.sessions.values()) {
      if (isSessionActive(session.state) && onPlan(this.#office.model, session)) {
        this.#track(session);
      }
    }
    this.#following = followEvents(
      this.#office,
      ["session.started", "session.ended"],
      (event) => {
        this.#onEvent(event);
      },
      this.#log,
      "plan usage",
    );
    this.#schedule(0);
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    await this.#following?.stop();
    await this.#polling;
  }

  #track(session: Session): void {
    this.#tracked.set(session.id, { tokens: weightOf(session.usage), share: 0, ended: false });
  }

  #onEvent(event: StoredEvent): void {
    if (event.type === "session.started") {
      const { session } = event.payload;
      if (onPlan(this.#office.model, session)) {
        this.#track(session);
        this.#schedule(0);
      }
    } else if (event.type === "session.ended") {
      const tracked = this.#tracked.get(event.payload.sessionId);
      if (tracked !== undefined) {
        tracked.ended = true;
        this.#schedule(SETTLE_POLL_MS);
      }
    }
  }

  #schedule(ms: number): void {
    if (this.#stopped) {
      return;
    }
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
    }
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#polling ??= this.#poll()
        .catch((error: unknown) => {
          this.#log.warn({ err: errorMessage(error) }, "plan usage poll failed");
        })
        .finally(() => {
          this.#polling = null;
        });
    }, ms);
  }

  async #poll(): Promise<void> {
    if (!anyonePlanned(this.#office.model)) {
      this.#status = { kind: "off", reason: "no colleague works on a Claude subscription" };
      this.#schedule(IDLE_POLL_MS);
      return;
    }
    const at = this.#office.clock.now().toISOString();
    const outcome = await readPlanUsage(at).catch((error: unknown): PlanUsageOutcome => ({
      kind: "unavailable",
      message: errorMessage(error),
    }));
    if (outcome.kind === "ok") {
      this.#attribute(outcome.usage);
      this.#last = outcome.usage;
      this.#status = { kind: "ok", usage: outcome.usage, running: this.#running() };
    } else {
      this.#status = outcome;
      this.#log.debug({ kind: outcome.kind, message: outcome.message }, "plan usage not read");
    }
    await this.#finalize();
    const active = [...this.#tracked.values()].some((tracked) => !tracked.ended);
    this.#schedule(active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
  }

  #attribute(next: PlanUsage): void {
    const { model } = this.#office;
    const growth = new Map<SessionId, number>();
    for (const [id, tracked] of this.#tracked) {
      const session = model.sessions.get(id);
      const tokens = session === undefined ? tracked.tokens : weightOf(session.usage);
      growth.set(id, Math.max(0, tokens - tracked.tokens));
      tracked.tokens = tokens;
    }
    const previous = this.#last?.fiveHour ?? null;
    const current = next.fiveHour;
    if (previous === null || current === null || this.#tracked.size === 0) {
      return;
    }
    const reset = previous.resetsAt !== current.resetsAt || current.percent < previous.percent;
    const delta = reset ? current.percent : current.percent - previous.percent;
    if (delta <= 0) {
      return;
    }
    const total = [...growth.values()].reduce((sum, value) => sum + value, 0);
    for (const [id, tracked] of this.#tracked) {
      const weight = total > 0 ? (growth.get(id) ?? 0) / total : 1 / this.#tracked.size;
      tracked.share += delta * weight;
    }
  }

  #running(): Record<SessionId, number> {
    const running: Record<SessionId, number> = {};
    for (const [id, tracked] of this.#tracked) {
      if (!tracked.ended) {
        running[id] = rounded(tracked.share);
      }
    }
    return running;
  }

  async #finalize(): Promise<void> {
    for (const [id, tracked] of this.#tracked) {
      if (!tracked.ended) {
        continue;
      }
      this.#tracked.delete(id);
      const percent = rounded(tracked.share);
      await this.#office
        .execute(SYSTEM_ACTOR, (m, c) => recordSessionPlan(m, { sessionId: id, percent }, c))
        .catch((error: unknown) => {
          this.#log.warn({ sessionId: id, err: errorMessage(error) }, "plan share not recorded");
        });
    }
  }
}
