import { createIdFactory, isSessionActive } from "@ho/core";
import type { AgentId, LiveEvent, ProjectId, Session, StoredEvent, TaskId } from "@ho/protocol";
import {
  addFloor,
  assignWork,
  createWorld,
  emotionFor,
  handoff,
  idleBehaviour,
  LOBBY_ID,
  lobbyTemplate,
  projectTemplate,
  receive,
  releaseWork,
  removeActor,
  removeFloor,
  setEmotion,
  sleep,
  spawnActor,
  tick,
  wake,
} from "@ho/sim";
import type { Client } from "../rpc.ts";
import { model } from "../store.ts";
import { MailFlow } from "./mail-flow.ts";

type PendingHandoff = { from: AgentId; to: AgentId; taskId: TaskId };
const MAX_DT_MS = 250;
const POSTMAN_NAME = "Postman";

/**
 * Turns the office's history and live stream into simulation intents, and reports the moments the
 * daemon waits for (a delivered handoff) back over RPC.
 */
export class Bridge {
  readonly world = createWorld("home-office");
  #client: Client | null = null;
  readonly #pending: PendingHandoff[] = [];
  readonly #mail: MailFlow;
  readonly #sleeping = new Set<AgentId>();
  /** Visitor ids come from the same UUIDv7 factory as agents so the sim's branded ids stay honest. */
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

  constructor() {
    addFloor(this.world, lobbyTemplate());
    this.#mail = new MailFlow(
      this.world,
      () => this.#ids.agent(),
      (taskId) => {
        this.#deliverMail(taskId);
      },
    );
  }

  /** Name shown above an actor: the agent's, or the visitor's role. */
  nameOf(id: AgentId): string {
    return this.world.actors.get(id)?.kind === "visitor"
      ? POSTMAN_NAME
      : (model.agents.get(id)?.name ?? "?");
  }

  attach(client: Client): void {
    this.#client = client;
  }

  detach(): void {
    this.#client = null;
  }

  /**
   * Whether somebody can see the office. A hidden window stops animation frames, so pending and new
   * handoffs are reported right away instead of holding the recipient's session for nothing.
   */
  setWatching(watching: boolean): void {
    this.#watching = watching;
    if (!watching) {
      for (const pending of this.#pending) {
        this.#deliver(pending.taskId);
      }
      this.#mail.flush();
    }
  }

  floorFor(projectId: ProjectId): string {
    const project = model.projects.get(projectId);
    return project === undefined || project.repo.kind === "none" ? LOBBY_ID : project.id;
  }

  /** Reconciles floors, actors and seats with the read model (after replay and on roster changes). */
  syncFromModel(): void {
    const { world } = this;
    for (const project of model.projects.values()) {
      if (project.repo.kind !== "none" && !world.floors.has(project.id)) {
        const seats = [...model.agents.values()].filter((a) => a.projectIds.includes(project.id));
        addFloor(world, projectTemplate(project.id, project.name, Math.max(4, seats.length)));
      }
    }
    const projectIds = new Set<string>(model.projects.keys());
    for (const floorId of world.floors.keys()) {
      if (floorId !== LOBBY_ID && !projectIds.has(floorId)) {
        removeFloor(world, floorId);
      }
    }
    for (const agent of model.agents.values()) {
      const sprite = `characters/${agent.appearance.spriteSet}`;
      const actor = world.actors.get(agent.id);
      if (actor === undefined) {
        spawnActor(world, agent.id, sprite, LOBBY_ID);
      } else {
        actor.sprite = sprite;
      }
    }
    for (const [id, actor] of world.actors) {
      if (actor.kind === "agent" && !model.agents.has(id)) {
        removeActor(world, id);
      }
    }
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
    const floorId = this.floorFor(task.projectId);
    const kind = agent.role === "boss" && floorId === LOBBY_ID ? "boss-desk" : "desk";
    assignWork(this.world, session.agentId, floorId, kind);
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
      if (fromAgentId !== toAgentId && handoff(this.world, fromAgentId, toAgentId)) {
        this.#pending.push({ from: fromAgentId, to: toAgentId, taskId });
        if (!this.#watching) {
          this.#deliver(taskId);
        }
      } else {
        this.#deliver(taskId);
      }
    } else if (event.type === "task.note_added") {
      const task = model.tasks.get(event.payload.taskId);
      if (task?.assigneeId !== undefined && event.payload.note.kind === "question") {
        setEmotion(this.world, task.assigneeId, "question", null);
      } else if (task?.assigneeId !== undefined && event.payload.note.kind === "answer") {
        setEmotion(this.world, task.assigneeId, null, null);
      }
    } else if (event.type === "chat.message_posted") {
      if (event.payload.author.kind === "human") {
        const boss = [...model.agents.values()].find((a) => a.role === "boss");
        if (boss !== undefined) {
          setEmotion(this.world, boss.id, "envelope", 4000);
        }
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
    void this.#client?.office.handoffDelivered({ taskId }).catch(() => null);
  }

  #deliverMail(taskId: TaskId): void {
    void this.#client?.office.mailDelivered({ taskId }).catch(() => null);
  }

  /** Advances the simulation and reports delivered handoffs. */
  tick(dtMs: number): void {
    tick(this.world, Math.min(dtMs, MAX_DT_MS), idleBehaviour);
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
      } else if (event.kind === "visitor_left") {
        removeActor(this.world, event.actorId);
      } else {
        this.#mail.onSimEvent(event);
      }
    }
  }
}
