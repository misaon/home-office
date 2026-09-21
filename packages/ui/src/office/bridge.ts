import { bossOf, createIdFactory } from "@ho/core";
import {
  type AgentId,
  isQuestionReason,
  isSessionActive,
  type LiveEvent,
  type Session,
  type StoredEvent,
  type Task,
  TaskId,
} from "@ho/protocol";
import {
  type Actor,
  adjourn,
  assignWork,
  carry,
  createWorld,
  emotionFor,
  inFlight,
  receive,
  releaseWork,
  removeActor,
  setEmotion,
  sleep,
  tick,
  wake,
} from "@ho/sim";
import type { Client } from "../rpc.ts";
import { Interpolation } from "./interpolation.ts";
import { model } from "../store.ts";
import { Envelopes } from "./envelopes.ts";
import { MailFlow } from "./mail-flow.ts";
import { conveneFor, deciding, isDecision } from "./meetings.ts";
import { syncRoster } from "./roster.ts";

const MAX_DT_MS = 250;
const STEP_MS = 1000 / 60;

export class Bridge {
  readonly world = createWorld("home-office");
  readonly #receptionists = new Map<string, AgentId>();
  readonly #envelopes = new Envelopes();
  readonly #mail: MailFlow;
  readonly #sleeping = new Set<AgentId>();
  readonly #interpolation = new Interpolation();
  readonly #ids = createIdFactory(
    { now: () => new Date() },
    {
      randomize: (bytes) => {
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

  setWatching(watching: boolean): void {
    this.#watching = watching;
    if (!watching) {
      this.#envelopes.flush();
      this.#mail.flush();
    }
  }

  syncFromModel(): void {
    syncRoster(this.world, this.#receptionists);
    this.#envelopes.sweep((taskId) => inFlight(this.world, { kind: "task", id: taskId }));
    this.#mail.sweep((ref) => inFlight(this.world, { kind: "mail", id: ref }) > 0);
    for (const session of model.sessions.values()) {
      if (isSessionActive(session.state)) {
        this.#seat(session);
      }
    }
    for (const task of model.tasks.values()) {
      if (isDecision(task) && deciding(task)) {
        conveneFor(this.world, task);
      }
    }
  }

  #seat(session: Session): void {
    const agent = model.agents.get(session.agentId);
    if (agent !== undefined && model.tasks.has(session.taskId)) {
      assignWork(this.world, session.agentId, agent.projectId, agent.role);
    }
  }

  #carry(from: AgentId, to: AgentId, taskId: TaskId): void {
    if (
      from !== to &&
      this.#watching &&
      carry(this.world, from, to, { kind: "task", id: taskId })
    ) {
      this.#envelopes.sent(taskId);
    } else {
      this.#deliver(taskId);
    }
  }

  #onChat(task: Task): void {
    const boss = bossOf(model, task.projectId);
    const lola = this.#receptionists.get(task.projectId);
    if (boss === undefined || lola === undefined) {
      this.#deliver(task.id);
      return;
    }
    this.#carry(lola, boss.id, task.id);
  }

  #onStatus(event: Extract<StoredEvent, { type: "task.status_changed" }>): void {
    const task = model.tasks.get(event.payload.taskId);
    const { from, to, reason } = event.payload;
    if (task !== undefined && isDecision(task) && !deciding(task)) {
      adjourn(this.world, task.id);
    }
    if (task?.kind !== "work") {
      return;
    }
    const boss = bossOf(model, task.projectId);
    if (boss === undefined) {
      return;
    }
    const walks =
      task.assigneeId !== undefined &&
      task.assigneeId !== boss.id &&
      (to === "done" || (to === "blocked" && !isQuestionReason(reason)));
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
        const { task } = event.payload;
        if (task.kind === "triage" && task.source.kind === "chat") {
          this.#onChat(task);
        } else if (isDecision(task)) {
          conveneFor(this.world, task);
        }
        break;
      }
      case "mail.received": {
        this.#mail.onMail(event.payload.mail, this.#watching);
        break;
      }
      case "task.shape_raised":
      case "project.created":
      case "project.updated":
      case "project.removed":
      case "agent.created":
      case "agent.updated":
      case "agent.removed": {
        this.syncFromModel();
        break;
      }
      case "task.rated":
      case "chat.cleared":
      case "chat.message_posted":
      case "mail.acknowledged":
      case "mandate.opened":
      case "mandate.acceptance_stated":
      case "mandate.evidence_recorded":
      case "mandate.artifacts_changed":
      case "mandate.baseline_recorded":
      case "mandate.status_changed":
      case "mandate.round_opened":
      case "session.state_changed":
      case "session.usage_recorded":
      case "session.plan_recorded":
      case "task.artifacts_changed":
      case "task.assigned":
      case "task.removed":
      case "task.edited":
      case "task.review_recorded":
      case "task.review_waived":
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

  positionOf(actor: Actor): { x: number; y: number } {
    return this.#interpolation.positionOf(actor, Math.min(1, this.#accumulator / STEP_MS));
  }

  tick(dtMs: number): void {
    this.#accumulator += Math.max(0, Math.min(dtMs, MAX_DT_MS));
    while (this.#accumulator >= STEP_MS) {
      this.#interpolation.remember(this.world);
      tick(this.world, STEP_MS);
      this.#accumulator -= STEP_MS;
    }
    for (const event of this.world.outbox.splice(0)) {
      if (event.kind === "visitor_left") {
        removeActor(this.world, event.actorId);
      } else if (event.kind === "delivered" && event.ref.kind === "task") {
        this.#onEnvelope(event.ref.id, event.by, event.to);
      } else {
        this.#mail.onSimEvent(event);
      }
    }
  }

  #onEnvelope(id: string, by: AgentId, to: AgentId): void {
    const taskId = TaskId.safeParse(id);
    if (!taskId.success || !this.#envelopes.arrived(taskId.data)) {
      return;
    }
    receive(this.world, to, by);
    this.#deliver(taskId.data);
  }
}

export const bridge = new Bridge();
