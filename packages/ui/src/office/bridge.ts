import { bossOf, createIdFactory } from "@ho/core";
import {
  type AgentId,
  isSessionActive,
  type LiveEvent,
  type Session,
  type StoredEvent,
  type Task,
  TaskId,
} from "@ho/protocol";
import {
  assignWork,
  carry,
  createWorld,
  emotionFor,
  inFlight,
  receive,
  releaseWork,
  removeActor,
  setEmotion,
  type SimEvent,
  sleep,
  tick,
  wake,
} from "@ho/sim";
import type { Client } from "../rpc.ts";
import { model } from "../store.ts";
import { Envelopes } from "./envelopes.ts";
import { MailFlow } from "./mail-flow.ts";
import { syncRoster } from "./roster.ts";

const MAX_DT_MS = 250;
const STEP_MS = 1000 / 30;
const QUESTION_PREFIX = "question:";

/**
 * Turns the office's history and live stream into simulation intents — one floor per project, each with its
 * boss, its staff and Lola at the reception — and reports the moments the daemon waits for (a delivered
 * envelope) back over RPC.
 */
export class Bridge {
  readonly world = createWorld("home-office");
  /** The receptionist of every floor (an office character, never an agent). */
  readonly #receptionists = new Map<string, AgentId>();
  readonly #envelopes = new Envelopes();
  readonly #mail: MailFlow;
  readonly #sleeping = new Set<AgentId>();
  /** Visitor and receptionist ids come from the same UUIDv7 factory as agents so the sim's branded ids stay honest. */
  readonly #ids = createIdFactory(
    { now: () => new Date() },
    {
      randomize: (bytes) => {
        // The DOM signature wants a plain ArrayBuffer-backed view; fill a fresh one and copy.
        bytes.set(crypto.getRandomValues(new Uint8Array(bytes.length)));
      },
    },
  );
  #watching = true;
  #accumulator = 0;

  constructor() {
    this.#mail = new MailFlow(
      this.world,
      () => this.#ids.agent(),
      (taskId) => {
        this.#deliver(taskId);
      },
      (floorId) => this.#receptionists.get(floorId) ?? null,
    );
  }

  attach(client: Client): void {
    this.#envelopes.attach(client);
  }

  detach(): void {
    this.#envelopes.detach();
  }

  /**
   * Whether somebody can see the office. A hidden window stops animation frames, so pending and new
   * envelopes are reported right away instead of holding the daemon for nothing.
   */
  setWatching(watching: boolean): void {
    this.#watching = watching;
    if (!watching) {
      this.#envelopes.flush();
      this.#mail.flush();
    }
  }

  /** Reconciles floors, actors and seats with the read model (after replay and on roster changes). */
  syncFromModel(): void {
    syncRoster(this.world, this.#receptionists, () => this.#ids.agent());
    // A floor or a colleague can disappear mid-walk, taking the envelope's carrier with them.
    this.#envelopes.sweep((taskId) => inFlight(this.world, taskId));
    this.#mail.sweep((ref) => inFlight(this.world, ref) > 0);
    for (const session of model.sessions.values()) {
      if (isSessionActive(session.state)) {
        this.#seat(session);
      }
    }
  }

  #seat(session: Session): void {
    const agent = model.agents.get(session.agentId);
    if (agent !== undefined && model.tasks.has(session.taskId)) {
      assignWork(this.world, session.agentId, agent.projectId, agent.role);
    }
  }

  /** A carrier walks the envelope to a colleague; without viewers (or a walk) the daemon hears at once. */
  #carry(from: AgentId, to: AgentId, taskId: TaskId): void {
    if (from !== to && this.#watching && carry(this.world, from, to, taskId)) {
      this.#envelopes.sent(taskId);
    } else {
      this.#deliver(taskId);
    }
  }

  /** The human wrote to a floor's boss: Lola takes the envelope from the reception to his office. */
  #onChat(task: Task): void {
    const boss = bossOf(model, task.projectId);
    const lola = this.#receptionists.get(task.projectId);
    if (boss === undefined || lola === undefined) {
      this.#deliver(task.id);
      return;
    }
    this.#carry(lola, boss.id, task.id);
  }

  /** Finished (or stuck) work walks back to the boss before he reports it in the chat. */
  #onStatus(event: Extract<StoredEvent, { type: "task.status_changed" }>): void {
    const task = model.tasks.get(event.payload.taskId);
    const { from, to, reason } = event.payload;
    if (task?.kind !== "work") {
      return;
    }
    const boss = bossOf(model, task.projectId);
    if (boss === undefined) {
      return;
    }
    // The same rule the daemon waits on (`walksBack` in boss-voice.ts): somebody else did the work and
    // it just ended. Anything else is not an envelope, so the daemon is not waiting for one.
    const walks =
      task.assigneeId !== undefined &&
      task.assigneeId !== boss.id &&
      (to === "done" || (to === "blocked" && reason?.startsWith(QUESTION_PREFIX) !== true));
    if (!walks) {
      return;
    }
    const carrier = from === "review" ? task.reviewerId : task.assigneeId;
    if (carrier === undefined) {
      this.#deliver(task.id);
      return;
    }
    this.#carry(carrier, boss.id, task.id);
  }

  onEvent(event: StoredEvent): void {
    switch (event.type) {
      case "session.started": {
        this.#seat(event.payload.session);
        break;
      }
      case "session.ended": {
        const session = model.sessions.get(event.payload.sessionId);
        if (session !== undefined) {
          releaseWork(this.world, session.agentId, event.payload.state === "stopped");
          this.#sleeping.delete(session.agentId);
        }
        break;
      }
      case "handoff.requested": {
        const { fromAgentId, toAgentId, taskId } = event.payload;
        this.#carry(fromAgentId, toAgentId, taskId);
        break;
      }
      case "task.status_changed": {
        this.#onStatus(event);
        break;
      }
      case "task.note_added": {
        const task = model.tasks.get(event.payload.taskId);
        if (task?.assigneeId !== undefined && event.payload.note.kind === "question") {
          setEmotion(this.world, task.assigneeId, "question", null);
        } else if (task?.assigneeId !== undefined && event.payload.note.kind === "answer") {
          setEmotion(this.world, task.assigneeId, null, null);
        }
        break;
      }
      case "task.created": {
        // The human's message is stored before its task; the task is what Lola carries and the daemon waits for.
        const { task } = event.payload;
        if (task.kind === "triage" && task.source.kind === "chat") {
          this.#onChat(task);
        }
        break;
      }
      case "mail.received": {
        this.#mail.onMail(event.payload.mail, this.#watching);
        break;
      }
      case "project.created":
      case "project.updated":
      case "project.removed":
      case "agent.created":
      case "agent.updated":
      case "agent.removed": {
        this.syncFromModel();
        break;
      }
      case "chat.message_posted":
      case "mail.acknowledged":
      case "session.state_changed":
      case "session.usage_recorded":
      case "task.artifacts_changed":
      case "task.assigned":
      case "task.removed":
      case "task.edited":
      case "task.review_recorded":
      case "task.reviewer_assigned": {
        break;
      }
    }
  }

  onLive(live: LiveEvent): void {
    const session = model.sessions.get(live.sessionId);
    if (session === undefined) {
      return;
    }
    const { agentId } = session;
    if (live.event.kind === "rate_limited") {
      this.#sleeping.add(agentId);
      sleep(this.world, agentId);
    } else if (this.#sleeping.has(agentId) && live.event.kind !== "usage") {
      this.#sleeping.delete(agentId);
      wake(this.world, agentId);
      this.#seat(session);
    }
    const cue = emotionFor(live.event);
    if (cue !== null) {
      setEmotion(this.world, agentId, cue.kind, cue.ttlMs);
    }
  }

  #deliver(taskId: TaskId): void {
    this.#envelopes.report(taskId);
  }

  /** Advances the simulation and reports delivered envelopes. */
  tick(dtMs: number): void {
    this.#accumulator += Math.max(0, Math.min(dtMs, MAX_DT_MS));
    while (this.#accumulator >= STEP_MS) {
      tick(this.world, STEP_MS);
      this.#accumulator -= STEP_MS;
    }
    for (const event of this.world.outbox.splice(0)) {
      if (event.kind === "visitor_left") {
        removeActor(this.world, event.actorId);
      } else if (!this.#onDelivered(event)) {
        this.#mail.onSimEvent(event);
      }
    }
  }

  /** An envelope this bridge sent out reached its colleague; mail refs fall through to the mail flow. */
  #onDelivered(event: SimEvent): boolean {
    if (event.kind !== "delivered") {
      return false;
    }
    const taskId = TaskId.safeParse(event.ref);
    if (!taskId.success || !this.#envelopes.arrived(taskId.data)) {
      return false;
    }
    receive(this.world, event.to, event.by);
    this.#deliver(taskId.data);
    return true;
  }
}

/** One simulation per page; React components and the sync loop share it. */
export const bridge = new Bridge();
