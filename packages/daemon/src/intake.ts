import { acknowledgeMail, findMail, type IntakeConnector, receiveMail } from "@ho/core";
import {
  errorMessage,
  type IntakePollResult,
  type IntakeStatus,
  type Project,
  type ProjectId,
  SYSTEM_ACTOR,
} from "@ho/protocol";
import { delegationAck, outcomeAck, type SourceAck } from "./intake-acks.ts";
import type { Logger } from "./logger.ts";
import { followEvents, type Office } from "./office.ts";

const FIRST_POLL_MS = 1000;

type ProjectState = {
  timer: ReturnType<typeof setTimeout> | null;
  lastPollAt: string | null;
  nextPollAt: string | null;
  lastError: string | null;
  received: number;
  lastDryRun: string[];
  polling: boolean;
};

const fresh = (): ProjectState => ({
  timer: null,
  lastPollAt: null,
  nextPollAt: null,
  lastError: null,
  received: 0,
  lastDryRun: [],
  polling: false,
});

/**
 * Intake service: polls every enabled project's connector on its own interval, turns new items into mail
 * and tasks, and reports back to the source when the office received, delegated and finished them.
 * Dry-run projects only record what would arrive.
 */
export class IntakeService {
  readonly #office: Office;
  readonly #connector: IntakeConnector;
  readonly #log: Logger;
  readonly #state = new Map<ProjectId, ProjectState>();
  readonly #controller = new AbortController();
  readonly #pending = new Set<Promise<unknown>>();
  #following: { stop: () => Promise<void> } | null = null;

  constructor(office: Office, connector: IntakeConnector, log: Logger) {
    this.#office = office;
    this.#connector = connector;
    this.#log = log;
  }

  start(): void {
    this.#reschedule();
    this.#following = followEvents(
      this.#office,
      [
        "project.created",
        "project.updated",
        "project.removed",
        "task.created",
        "task.status_changed",
      ],
      (event) => {
        if (event.type === "task.created") {
          return this.#track(this.#tell(delegationAck(this.#office.model, event.payload.task)));
        }
        if (event.type === "task.status_changed") {
          const { taskId, to, reason } = event.payload;
          return this.#track(this.#tell(outcomeAck(this.#office.model, taskId, to, reason)));
        }
        this.#reschedule();
        return undefined;
      },
      this.#log,
      "intake",
    );
  }

  async stop(): Promise<void> {
    this.#controller.abort();
    // The subscription drains first: a handler still in flight would otherwise arm a fresh timer.
    await this.#following?.stop();
    for (const state of this.#state.values()) {
      if (state.timer !== null) {
        clearTimeout(state.timer);
      }
    }
    await Promise.allSettled(this.#pending);
  }

  status(): IntakeStatus[] {
    return [...this.#office.model.projects.values()].map((p) => {
      const state = this.#state.get(p.id) ?? fresh();
      return {
        projectId: p.id,
        enabled: p.intake.enabled,
        lastPollAt: state.lastPollAt,
        nextPollAt: p.intake.enabled ? state.nextPollAt : null,
        lastError: state.lastError,
        received: state.received,
        lastDryRun: state.lastDryRun,
      };
    });
  }

  /** Polls now: one project, or every project with intake enabled. */
  async pollNow(projectId?: ProjectId): Promise<IntakePollResult[]> {
    const projects = [...this.#office.model.projects.values()].filter((p) =>
      projectId === undefined ? p.intake.enabled : p.id === projectId,
    );
    const results: IntakePollResult[] = [];
    for (const project of projects) {
      results.push(await this.#track(this.#poll(project)));
    }
    return results;
  }

  #stateFor(projectId: ProjectId): ProjectState {
    let state = this.#state.get(projectId);
    if (state === undefined) {
      state = fresh();
      this.#state.set(projectId, state);
    }
    return state;
  }

  /** Re-arms every enabled project's timer from its current settings and disarms the rest. */
  #reschedule(): void {
    if (this.#controller.signal.aborted) {
      return;
    }
    const live = new Set<ProjectId>();
    for (const project of this.#office.model.projects.values()) {
      if (project.intake.enabled) {
        live.add(project.id);
        const state = this.#stateFor(project.id);
        this.#arm(
          project.id,
          state.lastPollAt === null ? FIRST_POLL_MS : project.intake.intervalSeconds * 1000,
        );
      }
    }
    for (const [projectId, state] of this.#state) {
      if (!live.has(projectId) && state.timer !== null) {
        clearTimeout(state.timer);
        state.timer = null;
        state.nextPollAt = null;
      }
    }
  }

  #arm(projectId: ProjectId, delayMs: number): void {
    const state = this.#stateFor(projectId);
    if (state.timer !== null) {
      clearTimeout(state.timer);
    }
    state.nextPollAt = new Date(this.#office.clock.now().getTime() + delayMs).toISOString();
    state.timer = setTimeout(() => {
      state.timer = null;
      const project = this.#office.model.projects.get(projectId);
      if (project === undefined || !project.intake.enabled) {
        return;
      }
      void this.#track(this.#poll(project)).finally(() => {
        const current = this.#office.model.projects.get(projectId);
        if (!this.#controller.signal.aborted && current?.intake.enabled === true) {
          this.#arm(projectId, current.intake.intervalSeconds * 1000);
        }
      });
    }, delayMs);
  }

  #track<T>(work: Promise<T>): Promise<T> {
    const pending = work.finally(() => {
      this.#pending.delete(pending);
    });
    this.#pending.add(pending);
    return pending;
  }

  async #poll(project: Project): Promise<IntakePollResult> {
    const state = this.#stateFor(project.id);
    const result: IntakePollResult = {
      projectId: project.id,
      received: 0,
      duplicates: 0,
      dryRun: [],
    };
    if (this.#controller.signal.aborted || state.polling) {
      return result;
    }
    state.polling = true;
    try {
      const items = await this.#connector.poll(project, this.#controller.signal);
      state.lastPollAt = this.#office.clock.now().toISOString();
      for (const item of items) {
        this.#controller.signal.throwIfAborted();
        if (
          findMail(this.#office.model, project.id, this.#connector.id, item.externalId) !==
          undefined
        ) {
          result.duplicates += 1;
          continue;
        }
        if (project.intake.dryRun) {
          result.dryRun.push(`#${item.externalId} ${item.title}`);
          continue;
        }
        const received = await this.#office.execute(SYSTEM_ACTOR, (m, c) =>
          receiveMail(m, project.id, this.#connector.id, item, c),
        );
        if (received.duplicate) {
          result.duplicates += 1;
          continue;
        }
        result.received += 1;
        state.received += 1;
        this.#log.info(
          { projectId: project.id, mailId: received.mail.id, issue: item.externalId },
          "mail received",
        );
        await this.#tell({
          project,
          mail: received.mail,
          ack: {
            outcome: "received",
            detail:
              received.task === null
                ? ""
                : received.task.kind === "triage"
                  ? "The boss will triage it and delegate the work."
                  : "It waits in the project inbox for an assignee.",
          },
        });
      }
      state.lastDryRun = result.dryRun;
      state.lastError = null;
    } catch (error) {
      state.lastError = errorMessage(error);
      this.#log.warn({ projectId: project.id, err: state.lastError }, "intake poll failed");
    } finally {
      state.polling = false;
    }
    return result;
  }

  /** Records the acknowledgement and tells the source; a failing `gh` never affects the task. */
  async #tell(source: SourceAck | null): Promise<void> {
    if (source === null || this.#controller.signal.aborted) {
      return;
    }
    const { project, mail, ack } = source;
    try {
      const stamped = await this.#office.execute(SYSTEM_ACTOR, (m, c) =>
        acknowledgeMail(m, mail.id, ack, c),
      );
      const last = stamped.acks.at(-1);
      if (project.intake.dryRun || last === undefined) {
        return;
      }
      await this.#connector.acknowledge(project, mail, last, this.#controller.signal);
    } catch (error) {
      this.#log.warn({ err: errorMessage(error) }, `${ack.outcome} acknowledgement failed`);
    }
  }
}
