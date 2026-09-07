import {
  assignTask,
  copyAgent,
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
import { contract, SecretKeyName, type StoredEvent } from "@ho/protocol";
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
    gc: base.system.gc.handler(({ context }) => context.gc()),
  },
  usage: {
    summary: base.usage.summary.handler(({ input, context }) => context.usage(input.sinceHours)),
  },
  resources: {
    inventory: base.resources.inventory.handler(({ context }) =>
      context.provider.inventory(MANAGED),
    ),
  },
  secrets: {
    status: base.secrets.status.handler(async ({ context }) => {
      const present = await Promise.all(
        SecretKeyName.options.map(async (key) =>
          (await context.secrets.get(key)) === null ? null : key,
        ),
      );
      return { present: present.filter((key): key is SecretKeyName => key !== null) };
    }),
    set: base.secrets.set.handler(async ({ input, context }) => {
      await context.secrets.set(input.key, input.value);
      return { key: input.key };
    }),
    delete: base.secrets.delete.handler(async ({ input, context }) => {
      await context.secrets.delete(input.key);
      return { key: input.key };
    }),
  },
  projects: {
    list: base.projects.list.handler(({ context }) => [...context.office.model.projects.values()]),
    inspect: base.projects.inspect.handler(({ input, context }) => context.inspectRepo(input)),
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
    list: base.agents.list.handler(({ input, context }) =>
      [...context.office.model.agents.values()].filter(
        (a) => input.projectId === undefined || a.projectId === input.projectId,
      ),
    ),
    create: base.agents.create.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => createAgent(m, input, ctx)),
    ),
    update: base.agents.update.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => updateAgent(m, input, ctx)),
    ),
    copy: base.agents.copy.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => copyAgent(m, input, ctx)),
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
      context.office.model.chat
        .filter((m) => input.projectId === undefined || m.projectId === input.projectId)
        .slice(-input.limit),
    ),
    send: base.chat.send.handler(({ input, context }) =>
      context.office.execute(HUMAN, (m, ctx) => postChatMessage(m, input, ctx)),
    ),
  },
  mail: {
    list: base.mail.list.handler(({ input, context }) =>
      [...context.office.model.mail.values()].filter(
        (m) => input.projectId === undefined || m.projectId === input.projectId,
      ),
    ),
  },
  intake: {
    poll: base.intake.poll.handler(({ input, context }) => context.intake.pollNow(input.projectId)),
    status: base.intake.status.handler(({ context }) => context.intake.status()),
  },
  events: {
    head: base.events.head.handler(async ({ context }) => ({
      seq: await context.office.store.lastSeq(),
    })),
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
  office: {
    presence: base.office.presence.handler(async function* ({ context, signal }) {
      const detach = context.gate.attach();
      const beat = (): Promise<boolean> =>
        new Promise((resolve) => {
          if (signal?.aborted === true) {
            resolve(false);
            return;
          }
          const finish = (alive: boolean): void => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", aborted);
            resolve(alive);
          };
          const aborted = (): void => {
            finish(false);
          };
          const timer = setTimeout(() => {
            finish(true);
          }, 15_000);
          signal?.addEventListener("abort", aborted, { once: true });
        });
      try {
        yield { at: context.office.clock.now().toISOString() };
        while (await beat()) {
          yield { at: context.office.clock.now().toISOString() };
        }
      } finally {
        detach();
      }
    }),
    delivered: base.office.delivered.handler(({ input, context }) => {
      context.gate.delivered(input.taskId, context.office.clock.now().toISOString());
      return { ok: true as const };
    }),
  },
});
