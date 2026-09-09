import { bossOf, createIdFactory, isSessionActive, RECEPTIONIST } from "@ho/core";
import type { AgentId, LiveEvent, Session, StoredEvent, Task, TaskId } from "@ho/protocol";
import {
  assignWork,
  carryEnvelope,
  createWorld,
  emotionFor,
  type FloorTemplate,
  handoff,
  idleBehaviour,
  floorTemplate,
  receive,
  releaseWork,
  removeActor,
  setEmotion,
  sleep,
  tick,
  wake,
} from "@ho/sim";
import type { Client } from "../rpc.ts";
import { model } from "../store.ts";
import { MailFlow } from "./mail-flow.ts";
import { syncRoster } from "./roster.ts";

type PendingHandoff = { from: AgentId; to: AgentId; taskId: TaskId };
const MAX_DT_MS = 250;
const STEP_MS = 1000 / 30;
const POSTMAN_NAME = "Postman";
const QUESTION_PREFIX = "question:";

/**
 * Turns the office's history and live stream into simulation intents — one floor per project, each with its
 * boss, its staff and Lola at the reception — and reports the moments the daemon waits for (a delivered
 * envelope) back over RPC.
 */
export class Bridge {
  readonly world = createWorld("home-office");
  readonly #templates = new Map<string, FloorTemplate>();
  /** The receptionist of every floor (an office character, never an agent). */
  readonly #receptionists = new Map<string, AgentId>();
  #client: Client | null = null;
  readonly #pending: PendingHandoff[] = [];
  /** Chat envelopes on their way from the reception to the boss: the sim's ref (the task id as text) → task. */
  readonly #envelopes = new Map<string, TaskId>();
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

  /** The floor of a project: the same blank plane under its own id. */
  templateFor(floorId: string): FloorTemplate {
    let template = this.#templates.get(floorId);
    if (template === undefined) {
      template = floorTemplate(floorId);
      this.#templates.set(floorId, template);
    }
    return template;
  }

  /** Name shown above an actor: the agent's, or the office character's. */
  nameOf(id: AgentId): string {
    const actor = this.world.actors.get(id);
    if (actor?.kind === "visitor") {
      return POSTMAN_NAME;
    }
    if (actor?.kind === "receptionist") {
      return RECEPTIONIST.name;
    }
    return model.agents.get(id)?.name ?? "?";
  }

  attach(client: Client): void {
    this.#client = client;
  }

  detach(): void {
    this.#client = null;
  }

  /**
   * Whether somebody can see the office. A hidden window stops animation frames, so pending and new
   * envelopes are reported right away instead of holding the daemon for nothing.
   */
  setWatching(watching: boolean): void {
    this.#watching = watching;
    if (!watching) {
      for (const pending of this.#pending.splice(0)) {
        this.#deliver(pending.taskId);
      }
      for (const taskId of this.#envelopes.values()) {
        this.#deliver(taskId);
      }
      this.#envelopes.clear();
      this.#mail.flush();
    }
  }

  /** Reconciles floors, actors and seats with the read model (after replay and on roster changes). */
  syncFromModel(): void {
    syncRoster({
      world: this.world,
      templateFor: (floorId) => this.templateFor(floorId),
      forgetFloor: (floorId) => {
        this.#templates.delete(floorId);
      },
      receptionists: this.#receptionists,
      newId: () => this.#ids.agent(),
    });
    for (const session of model.sessions.values()) {
      if (isSessionActive(session.state)) {
        this.#seat(session);
      }
    }
  }

  #seat(session: Session): void {
    const task = model.tasks.get(session.taskId);
    const agent = model.agents.get(session.agentId);
    if (task === undefined || agent === undefined) {
      return;
    }
    assignWork(this.world, session.agentId, agent.projectId, agent.role);
  }

  /** A carrier walks the envelope to a colleague; without viewers (or a walk) the daemon hears at once. */
  #carry(from: AgentId, to: AgentId, taskId: TaskId): void {
    if (from !== to && this.#watching && handoff(this.world, from, to)) {
      this.#pending.push({ from, to, taskId });
    } else {
      this.#deliver(taskId);
    }
  }

  /** The human wrote to a floor's boss: Lola takes the envelope from the reception to his office. */
  #onChat(task: Task): void {
    const boss = bossOf(model, task.projectId);
    const lola = this.#receptionists.get(task.projectId);
    if (
      boss === undefined ||
      lola === undefined ||
      !this.#watching ||
      !carryEnvelope(this.world, lola, boss.id, task.id)
    ) {
      this.#deliver(task.id);
      return;
    }
    this.#envelopes.set(task.id, task.id);
  }

  /** Finished (or stuck) work walks back to the boss before he reports it in the chat. */
  #onStatus(event: Extract<StoredEvent, { type: "task.status_changed" }>): void {
    const task = model.tasks.get(event.payload.taskId);
    const { from, to, reason } = event.payload;
    if (task === undefined || task.kind !== "work") {
      return;
    }
    const boss = bossOf(model, task.projectId);
    if (boss === undefined) {
      return;
    }
    const carrier = from === "review" ? task.reviewerId : task.assigneeId;
    const walks =
      (to === "done" || (to === "blocked" && reason?.startsWith(QUESTION_PREFIX) !== true)) &&
      (from === "in_progress" || from === "review");
    if (!walks || task.assigneeId === boss.id) {
      return;
    }
    if (carrier === undefined || carrier === boss.id) {
      this.#deliver(task.id);
      return;
    }
    this.#carry(carrier, boss.id, task.id);
  }

  onEvent(event: StoredEvent): void {
    if (event.type === "session.started") {
      this.#seat(event.payload.session);
    } else if (event.type === "session.ended") {
      const session = model.sessions.get(event.payload.sessionId);
      if (session !== undefined) {
        releaseWork(this.world, session.agentId, event.payload.state === "stopped");
        this.#sleeping.delete(session.agentId);
      }
    } else if (event.type === "handoff.requested") {
      const { fromAgentId, toAgentId, taskId } = event.payload;
      this.#carry(fromAgentId, toAgentId, taskId);
    } else if (event.type === "task.status_changed") {
      this.#onStatus(event);
    } else if (event.type === "task.note_added") {
      const task = model.tasks.get(event.payload.taskId);
      if (task?.assigneeId !== undefined && event.payload.note.kind === "question") {
        setEmotion(this.world, task.assigneeId, "question", null);
      } else if (task?.assigneeId !== undefined && event.payload.note.kind === "answer") {
        setEmotion(this.world, task.assigneeId, null, null);
      }
    } else if (event.type === "task.created") {
      // The human's message is stored before its task; the task is what Lola carries and the daemon waits for.
      const { task } = event.payload;
      if (task.kind === "triage" && task.source.kind === "chat") {
        this.#onChat(task);
      }
    } else if (event.type === "mail.received") {
      this.#mail.onMail(event.payload.mail, this.#watching);
    } else if (event.type.startsWith("project.") || event.type.startsWith("agent.")) {
      this.syncFromModel();
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
    void this.#client?.office.delivered({ taskId }).catch(() => null);
  }

  /** Advances the simulation and reports delivered envelopes. */
  tick(dtMs: number): void {
    this.#accumulator += Math.max(0, Math.min(dtMs, MAX_DT_MS));
    while (this.#accumulator >= STEP_MS) {
      tick(this.world, STEP_MS, idleBehaviour);
      this.#accumulator -= STEP_MS;
    }
    for (const event of this.world.outbox.splice(0)) {
      if (event.kind === "handoff_delivered") {
        const index = this.#pending.findIndex((p) => p.from === event.from && p.to === event.to);
        if (index >= 0) {
          const [pending] = this.#pending.splice(index, 1);
          if (pending !== undefined) {
            receive(this.world, pending.to, pending.from);
            this.#deliver(pending.taskId);
          }
        }
      } else if (event.kind === "envelope_delivered" && this.#envelopes.has(event.ref)) {
        const taskId = this.#envelopes.get(event.ref);
        this.#envelopes.delete(event.ref);
        receive(this.world, event.to, event.by);
        if (taskId !== undefined) {
          this.#deliver(taskId);
        }
      } else if (event.kind === "visitor_left") {
        removeActor(this.world, event.actorId);
      } else {
        this.#mail.onSimEvent(event);
      }
    }
  }
}
