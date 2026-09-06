import { acknowledgeMail, type IntakeConnector, receiveMail, type ReceivedMail } from "@ho/core";
import {
  GITHUB_ISSUES_CONNECTOR,
  type IntakePollResult,
  type IntakeStatus,
  type Project,
  type ProjectId,
  type StoredEvent,
} from "@ho/protocol";
import { delegationAck, outcomeAck, type SourceAck } from "./intake-acks.ts";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";

const SYSTEM = { kind: "system" } as const;
const FIRST_POLL_MS = 1_000;

type ProjectState = {
  timer: ReturnType<typeof setTimeout> | null;
  intervalSeconds: number;
  lastPollAt: string | null;
  nextPollAt: string | null;
  lastError: string | null;
  received: number;
  lastDryRun: string[];
  polling: boolean;
};

const fresh = (): ProjectState => ({
  timer: null,
  intervalSeconds: 0,
  lastPollAt: null,
  nextPollAt: null,
  lastError: null,
  received: 0,
  lastDryRun: [],
  polling: false,
});

const receivedDetail = (received: ReceivedMail): string =>
  received.task === null
    ? ""
    : received.task.kind === "triage"
      ? "The boss will triage it and delegate the work."
      : "It waits in the project inbox for an assignee.";

/**
 * Intake service: polls every enabled project's connector on its own interval, turns new items into mail
 * and tasks, and reports back to the source when the office received, delegated and finished them.
 * Dry-run projects only record what would arrive.
 */
export class IntakeService {
  readonly #office: Office;
  readonly #connectors: Map<string, IntakeConnector>;
  readonly #log: Logger;
  readonly #state = new Map<ProjectId, ProjectState>();
  readonly #controller = new AbortController();

  constructor(office: Office, connectors: readonly IntakeConnector[], log: Logger) {
    this.#office = office;
    this.#connectors = new Map(connectors.map((c) => [c.id, c]));
    this.#log = log;
  }

  start(): void {
    this.#reschedule();
    void (async () => {
      const types: StoredEvent["type"][] = [
        "project.created",
        "project.updated",
        "project.removed",
        "task.created",
        "task.status_changed",
      ];
      for await (const event of this.#office.store.subscribe({ types }, this.#controller.signal)) {
        if (event.type.startsWith("project.")) {
          this.#reschedule();
        } else if (event.type === "task.created") {
          await this.#tell(delegationAck(this.#office.model, event.payload.task));
        } else if (event.type === "task.status_changed") {
          const { taskId, to, reason } = event.payload;
          await this.#tell(outcomeAck(this.#office.model, taskId, to, reason));
        }
      }
    })();
  }

  stop(): void {
    this.#controller.abort();
    for (const state of this.#state.values()) {
      if (state.timer !== null) {
        clearTimeout(state.timer);
      }
    }
  }

  status(): IntakeStatus[] {
    return [...this.#office.model.projects.values()]
      .filter((p) => p.repo.kind !== "none")
      .map((p) => {
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
      projectId === undefined ? p.intake.enabled && p.repo.kind !== "none" : p.id === projectId,
    );
    const results: IntakePollResult[] = [];
    for (const project of projects) {
      results.push(await this.#poll(project));
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

  /** Aligns timers with the projects' intake settings (on start and on every project change). */
  #reschedule(): void {
    const live = new Set<ProjectId>();
    for (const project of this.#office.model.projects.values()) {
      if (project.repo.kind === "none" || !project.intake.enabled) {
        continue;
      }
      live.add(project.id);
      const state = this.#stateFor(project.id);
      if (state.timer !== null && state.intervalSeconds === project.intake.intervalSeconds) {
        continue;
      }
      this.#arm(project.id, project.intake.intervalSeconds, state.lastPollAt === null);
    }
    for (const [projectId, state] of this.#state) {
      if (!live.has(projectId) && state.timer !== null) {
        clearTimeout(state.timer);
        state.timer = null;
        state.nextPollAt = null;
      }
    }
  }

  #arm(projectId: ProjectId, intervalSeconds: number, soon = false): void {
    const state = this.#stateFor(projectId);
    if (state.timer !== null) {
      clearTimeout(state.timer);
    }
    const delay = soon ? FIRST_POLL_MS : intervalSeconds * 1000;
    state.intervalSeconds = intervalSeconds;
    state.nextPollAt = new Date(this.#office.clock.now().getTime() + delay).toISOString();
    state.timer = setTimeout(() => {
      state.timer = null;
      const project = this.#office.model.projects.get(projectId);
      if (project === undefined || !project.intake.enabled) {
        return;
      }
      void this.#poll(project).finally(() => {
        const current = this.#office.model.projects.get(projectId);
        if (!this.#controller.signal.aborted && current?.intake.enabled === true) {
          this.#arm(projectId, current.intake.intervalSeconds);
        }
      });
    }, delay);
  }

  async #poll(project: Project): Promise<IntakePollResult> {
    const state = this.#stateFor(project.id);
    const result: IntakePollResult = {
      projectId: project.id,
      received: 0,
      duplicates: 0,
      dryRun: [],
    };
    const connector = this.#connectors.get(GITHUB_ISSUES_CONNECTOR);
    if (state.polling || connector === undefined) {
      return result;
    }
    state.polling = true;
    try {
      const items = await connector.poll(project, this.#controller.signal);
      state.lastPollAt = this.#office.clock.now().toISOString();
      for (const item of items) {
        const known = [...this.#office.model.mail.values()].some(
          (m) => m.projectId === project.id && m.externalId === item.externalId,
        );
        if (known) {
          result.duplicates += 1;
          continue;
        }
        if (project.intake.dryRun) {
          result.dryRun.push(`#${item.externalId} ${item.title}`);
          continue;
        }
        const received = await this.#office.execute(SYSTEM, (m, c) =>
          receiveMail(m, project.id, connector.id, item, c),
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
          ack: { outcome: "received", detail: receivedDetail(received) },
        });
      }
      state.lastDryRun = result.dryRun;
      state.lastError = null;
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      this.#log.warn({ projectId: project.id, err: state.lastError }, "intake poll failed");
    } finally {
      state.polling = false;
    }
    return result;
  }

  /** Records the acknowledgement and tells the source; a failing `gh` never affects the task. */
  async #tell(source: SourceAck | null): Promise<void> {
    if (source === null) {
      return;
    }
    const { project, mail, ack } = source;
    try {
      const stamped = await this.#office.execute(SYSTEM, (m, c) =>
        acknowledgeMail(m, mail.id, ack, c),
      );
      const connector = this.#connectors.get(mail.connector);
      const last = stamped.acks.at(-1);
      if (project.intake.dryRun || connector === undefined || last === undefined) {
        return;
      }
      await connector.acknowledge(project, mail, last, this.#controller.signal);
    } catch (error) {
      this.#log.warn(
        { err: error instanceof Error ? error.message : String(error) },
        `${ack.outcome} acknowledgement failed`,
      );
    }
  }
}
