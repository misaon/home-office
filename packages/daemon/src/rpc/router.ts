import {
  assignTask,
  createAgent,
  createChannel,
  createProject,
  createTask,
  editTask,
  isSessionActive,
  postChatMessage,
  removeAgent,
  removeProject,
  setTaskArtifacts,
  transitionTask,
  updateAgent,
  updateProject,
} from "@ho/core";
import { contract, type StoredEvent } from "@ho/protocol";
import { implement, ORPCError } from "@orpc/server";
import { DomainFailure } from "../errors.ts";
import type { RpcContext } from "./context.ts";

const os = implement(contract).$context<RpcContext>();

/** Runs an office command and translates domain failures into typed RPC errors. */
const guarded = os.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof DomainFailure) {
      switch (error.error.code) {
        case "not_found": {
          throw new ORPCError("NOT_FOUND", {
            message: error.message,
            data: { entity: error.error.entity, id: error.error.id },
          });
        }
        case "conflict": {
          throw new ORPCError("CONFLICT", {
            message: error.message,
            data: { reason: error.error.reason },
          });
        }
        case "invalid_transition": {
          throw new ORPCError("INVALID_TRANSITION", {
            message: error.message,
            data: { from: error.error.from, to: error.error.to },
          });
        }
      }
    }
    throw error;
  }
});

const base = os.use(guarded);
const HUMAN = { kind: "human" } as const;
const MANAGED = { "ho.managed": "true" } as const;

/** Bridges a callback-style producer into an async generator without dropping lines. */
async function* linesFrom(
  run: (onLine: (line: string) => void) => Promise<void>,
  signal: AbortSignal | undefined,
): AsyncGenerator<{ line: string }> {
  const channel = createChannel<{ line: string }>(signal);
  const state: { failure: Error | null } = { failure: null };
  void run((line) => {
    channel.push({ line });
  })
    .catch((error: unknown) => {
      state.failure = error instanceof Error ? error : new Error(String(error));
    })
    .finally(() => {
      channel.close();
    });
  yield* channel.iterate();
  if (state.failure !== null) {
    throw state.failure;
  }
}

export const router = base.router({
  system: {
    health: base.system.health.handler(({ context }) => ({
      ok: true,
      version: context.version,
      startedAt: context.startedAt,
      uptimeMs: Math.max(
        0,
        Math.round(context.office.clock.now().getTime() - new Date(context.startedAt).getTime()),
      ),
    })),
    doctor: base.system.doctor.handler(async ({ context }) => {
      const provider = await context.provider.health();
      return {
        provider,
        images: provider.ok ? await context.imageStatus() : [],
        secrets: {
          anthropicOauthToken: (await context.secrets.get("anthropic-oauth-token")) !== null,
        },
        sessions: {
          active: context.sessions.activeCount,
          max: context.config.scheduler.maxConcurrentSessions,
        },
        resources: provider.ok ? await context.provider.snapshot(MANAGED) : null,
      };
    }),
    buildImages: base.system.buildImages.handler(({ context, signal }) =>
      linesFrom(context.buildImages, signal),
    ),
  },
  projects: {
    list: base.projects.list.handler(({ context }) => [...context.office.model.projects.values()]),
    create: base.projects.create.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => createProject(m, input, ctx)),
    ),
    update: base.projects.update.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => updateProject(m, input, ctx)),
    ),
    remove: base.projects.remove.handler(async ({ input, context }) => ({
      id: await context.office.execute(HUMAN, (m, ctx) => removeProject(m, input.id, ctx)),
    })),
  },
  agents: {
    list: base.agents.list.handler(({ context }) => [...context.office.model.agents.values()]),
    create: base.agents.create.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => createAgent(m, input, ctx)),
    ),
    update: base.agents.update.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => updateAgent(m, input, ctx)),
    ),
    remove: base.agents.remove.handler(async ({ input, context }) => ({
      id: await context.office.execute(HUMAN, (m, ctx) => removeAgent(m, input.id, ctx)),
    })),
  },
  tasks: {
    list: base.tasks.list.handler(({ input, context }) =>
      [...context.office.model.tasks.values()].filter(
        (task) =>
          (input.projectId === undefined || task.projectId === input.projectId) &&
          (input.status === undefined || input.status.includes(task.status)),
      ),
    ),
    get: base.tasks.get.handler(({ input, context, errors }) => {
      const task = context.office.model.tasks.get(input.id);
      if (task === undefined) {
        throw errors.NOT_FOUND({ data: { entity: "task", id: input.id } });
      }
      return task;
    }),
    create: base.tasks.create.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => createTask(m, input, ctx)),
    ),
    edit: base.tasks.edit.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => editTask(m, input, ctx)),
    ),
    assign: base.tasks.assign.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => assignTask(m, input, ctx)),
    ),
    transition: base.tasks.transition.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => transitionTask(m, input, ctx)),
    ),
    setArtifacts: base.tasks.setArtifacts.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => setTaskArtifacts(m, input, ctx)),
    ),
  },
  sessions: {
    list: base.sessions.list.handler(({ input, context }) =>
      [...context.office.model.sessions.values()].filter(
        (s) =>
          (input.taskId === undefined || s.taskId === input.taskId) &&
          (input.active === undefined || isSessionActive(s.state) === input.active),
      ),
    ),
    stream: base.sessions.stream.handler(async function* ({ input, context, signal }) {
      for await (const live of context.sessions.stream(input.sessionId ?? null, signal)) {
        yield live;
      }
    }),
  },
  chat: {
    history: base.chat.history.handler(({ input, context }) =>
      context.office.model.chat.slice(-input.limit),
    ),
    send: base.chat.send.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => postChatMessage(m, input, ctx)),
    ),
  },
  events: {
    subscribe: base.events.subscribe.handler(async function* ({ input, context, signal }) {
      // Subscribe before replaying so nothing appended in between is lost; dedupe on seq.
      const live = context.office.store.subscribe(undefined, signal);
      let last = input.afterSeq ?? -1;
      for await (const event of context.office.store.read(last)) {
        yield event satisfies StoredEvent;
        last = event.seq;
      }
      for await (const event of live) {
        if (event.seq > last) {
          yield event;
          last = event.seq;
        }
      }
    }),
  },
});
