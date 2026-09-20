import {
  applyEvent,
  createIdFactory,
  createReadModel,
  planSessionStarts,
  type ReadModel,
} from "@ho/core";
import {
  type AgentId,
  type NewEvent,
  isSessionActive,
  type Session,
  type SessionId,
  type StoredEvent,
  ZERO_USAGE,
} from "@ho/protocol";
import { addFloor, createWorld, floorTemplate, spawnActor, tick } from "@ho/sim";

const AT = "2026-09-15T12:00:00.000Z";
const ids = createIdFactory(
  { now: () => new Date(AT) },
  {
    randomize: (bytes: Uint8Array) => {
      crypto.getRandomValues(bytes);
    },
  },
);

function measure(runs: number, body: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    body();
    times.push(performance.now() - started);
  }
  return times.toSorted((a, b) => a - b)[Math.floor(runs / 2)] ?? 0;
}

const ms = (value: number): string => `${value.toFixed(3)} ms`;

function seed(agents: number, tasks: number): StoredEvent[] {
  const projectId = ids.project();
  const agentIds = Array.from({ length: agents }, () => ids.agent());
  const projectOwner = agentIds[0] ?? ids.agent();
  const events: StoredEvent[] = [];
  const push = (event: NewEvent): void => {
    events.push({ ...event, id: ids.event(), at: AT, seq: events.length });
  };
  push({
    type: "project.created",
    actor: { kind: "system" },
    payload: {
      project: {
        id: projectId,
        name: "Bench",
        repo: { kind: "local", path: "/tmp/bench" },
        defaultBranch: "main",
        publish: { mode: "branch", draft: true },
        intake: {
          enabled: false,
          intervalSeconds: 120,
          labels: [],
          dryRun: false,
          ackLabel: "ho",
          comment: true,
        },
        hiring: { enabled: true },
        preview: { enabled: false, port: 8788 },
        services: { enabled: false, mode: "rootless", trust: "untrusted" },
        verify: { command: "", timeoutSeconds: 900, maxAttempts: 2 },
        acceptance: { verify: "integration", maxFixRounds: 2 },
        environment: { setup: [], services: [], seed: [], checks: {}, timeoutSeconds: 600 },
        createdAt: AT,
        updatedAt: AT,
      },
    },
  });
  for (const [a, agentId] of agentIds.entries()) {
    push({
      type: "agent.created",
      actor: { kind: "system" },
      payload: {
        agent: {
          id: agentId,
          name: `Agent${String(a)}`,
          role: a === 0 ? "boss" : "developer",
          appearance: { gender: "neutral" },
          provider: "claude-code",
          auth: "subscription",
          model: "sonnet",
          effort: "high",
          basePrompt: "",
          skillPack: "none",
          budgets: {
            maxTurnsPerTask: 60,
            maxConcurrentSessions: 1,
            maxWallMinutes: 60,
            maxReviewRounds: 2,
          },
          projectId,
          createdAt: AT,
          updatedAt: AT,
        },
      },
    });
  }
  for (let t = 0; t < tasks; t += 1) {
    const taskId = ids.task();
    const agentId = agentIds[t % agents] ?? projectOwner;
    push({
      type: "task.created",
      actor: { kind: "system" },
      payload: {
        task: {
          id: taskId,
          projectId,
          kind: "work",
          title: `Task ${String(t)}`,
          brief: "b",
          status: "assigned",
          assigneeId: agentId,
          reviews: { qa: false, security: false, head: true },
          dependsOn: [],
          reviewRounds: 0,
          notes: [],
          source: { kind: "manual" },
          artifacts: {},
          priority: "normal",
          createdAt: AT,
          updatedAt: AT,
        },
      },
    });
    const sessionId = ids.session();
    push({
      type: "session.started",
      actor: { kind: "system" },
      payload: {
        session: {
          id: sessionId,
          taskId,
          agentId,
          mode: "work",
          state: "running",
          round: 0,
          usage: ZERO_USAGE,
          startedAt: AT,
        },
      },
    });
    push({
      type: "session.ended",
      actor: { kind: "system" },
      payload: { sessionId, state: "stopped", endedAt: AT },
    });
  }
  return events;
}

const replay = (events: readonly StoredEvent[]): ReadModel => {
  const model = createReadModel();
  for (const event of events) {
    applyEvent(model, event);
  }
  return model;
};

process.stdout.write("== event replay: every daemon start, and every UI page load ==\n");
for (const tasks of [100, 1000, 10_000]) {
  const events = seed(12, tasks);
  const took = measure(5, () => {
    replay(events);
  });
  process.stdout.write(
    `  ${String(events.length).padStart(6)} events  ${ms(took).padStart(12)}  ${((took * 1000) / events.length).toFixed(2)} us/event\n`,
  );
}

const scanForSession = (
  sessions: ReadonlyMap<SessionId, Session>,
  agentId: AgentId,
): Session | undefined =>
  [...sessions.values()].find((s) => s.agentId === agentId && isSessionActive(s.state));

const buildActiveIndex = (sessions: ReadonlyMap<SessionId, Session>): Map<AgentId, Session> => {
  const index = new Map<AgentId, Session>();
  for (const session of sessions.values()) {
    if (isSessionActive(session.state)) {
      index.set(session.agentId, session);
    }
  }
  return index;
};

process.stdout.write("\n== captionOf(): one scan of every session, per actor, per frame ==\n");
process.stdout.write(
  "   History is what it looks like on a real floor: every session ended but the\n",
);
process.stdout.write("   last one per agent, so an idle colleague's lookup walks the whole map.\n");
const ACTORS = 12;
for (const tasks of [100, 1000, 10_000]) {
  const all = seed(ACTORS, tasks);
  const ends = all.filter((e): e is StoredEvent => e.type === "session.ended");
  const stillRunning = new Set<StoredEvent>(ends.slice(-ACTORS));
  const model = replay(all.filter((e) => !stillRunning.has(e)));
  const agents = [...model.agents.keys()];
  const scan = measure(20, () => {
    for (const agentId of agents) {
      scanForSession(model.sessions, agentId);
    }
  });
  const indexed = measure(20, () => {
    const index = buildActiveIndex(model.sessions);
    for (const agentId of agents) {
      index.get(agentId);
    }
  });
  process.stdout.write(
    `  ${String(model.sessions.size).padStart(6)} sessions  scan ${ms(scan).padStart(11)}/frame` +
      ` = ${(scan * 30).toFixed(0)} ms of every second   indexed ${ms(indexed)}\n`,
  );
}

process.stdout.write("\n== planSessionStarts(): runs on every relevant event ==\n");
for (const tasks of [100, 1000, 10_000]) {
  const model = replay(seed(12, tasks));
  const took = measure(20, () => {
    planSessionStarts(model, 3, false);
  });
  process.stdout.write(`  ${String(tasks).padStart(6)} tasks  ${ms(took).padStart(12)}\n`);
}

process.stdout.write("\n== sim tick(): the office's own frame, 33 ms budget at 30 fps ==\n");
for (const actors of [12, 40, 120]) {
  const world = createWorld("bench");
  const actorIds = Array.from({ length: actors }, () => ids.agent());
  addFloor(world, floorTemplate("floor-1"));
  for (const [a, actorId] of actorIds.entries()) {
    spawnActor(world, actorId, "floor-1", { kind: a === 0 ? "boss" : "staff" });
  }
  const took = measure(60, () => {
    tick(world, 33);
  });
  process.stdout.write(
    `  ${String(actors).padStart(6)} actors  ${ms(took).padStart(12)}  = ${((took / 33) * 100).toFixed(1)} % of the frame\n`,
  );
}

process.stdout.write("\n== what the projection holds ==\n");
for (const tasks of [1000, 10_000]) {
  const events = seed(12, tasks);
  Bun.gc(true);
  const before = process.memoryUsage().heapUsed;
  const model = replay(events);
  Bun.gc(true);
  const after = process.memoryUsage().heapUsed;
  process.stdout.write(
    `  ${String(tasks).padStart(6)} tasks  ${((after - before) / 1024 / 1024).toFixed(1)} MiB` +
      `  (${String(model.tasks.size)} tasks, ${String(model.sessions.size)} sessions)\n`,
  );
}
