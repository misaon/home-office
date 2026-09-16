import {
  answerQuestion,
  copyAgent,
  createAgent,
  createChannel,
  createProject,
  removeAgent,
  removeProject,
  sessionsOfTask,
  triageMessage,
  updateAgent,
  updateProject,
} from "@ho/core";
import { errorMessage, HUMAN_ACTOR, isSessionActive, SecretKeyName } from "@ho/protocol";
import { os } from "./implement.ts";
import { taskRoutes } from "./tasks.ts";
import { ensureImages, imageStatus, neededVariants } from "../images.ts";
import { MANAGED } from "../labels.ts";
import { listLayouts, saveLayout } from "../layouts.ts";
import { buildsImages } from "../paths.ts";
import { exportProject, syncProject } from "../office-config.ts";
import { inspectRepo } from "../repo-inspect.ts";
import { usageSummary } from "../usage.ts";
import { guarded } from "./guarded.ts";

const base = os.use(guarded);
const PRESENCE_BEAT_MS = 15_000;

/** Bridges a callback-style producer into an async generator without dropping lines. */
async function* linesFrom(
  run: (onLine: (line: string) => void) => Promise<void>,
  signal: AbortSignal | undefined,
): AsyncGenerator<{ line: string }> {
  const channel = createChannel<{ line: string }>(signal);
  const state: { failure: unknown } = { failure: null };
  void run((line) => {
    channel.push({ line });
  })
    .catch((error: unknown) => {
      state.failure = error;
    })
    .finally(() => {
      channel.close();
    });
  yield* channel.iterate();
  if (state.failure !== null) {
    throw state.failure instanceof Error ? state.failure : new Error(errorMessage(state.failure));
  }
}

/** Resolves after `ms` with false, or as soon as `signal` aborts with true. */
const sleepUntilAbort = (ms: number, signal: AbortSignal | undefined): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", done);
      resolve(false);
    }, ms);
    const done = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    signal?.addEventListener("abort", done, { once: true });
  });

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
      const { provider, config, resources, office } = context;
      const health = await provider.health();
      const inventory = health.ok ? await provider.inventory(MANAGED) : null;
      return {
        provider: health,
        images: health.ok
          ? await imageStatus(provider, config, resources, neededVariants(office.model))
          : [],
        imageContexts: buildsImages(resources),
        secrets: {
          anthropicOauthToken: (await context.secrets.get("anthropic-oauth-token")) !== null,
        },
        sessions: {
          active: office.model.activeSessions.size,
          max: config.scheduler.maxConcurrentSessions,
        },
        resources: inventory?.snapshot ?? null,
      };
    }),
    buildImages: base.system.buildImages.handler(({ context, signal }) =>
      linesFrom(
        (onLine) =>
          ensureImages(
            context.provider,
            context.config,
            context.resources,
            neededVariants(context.office.model),
            onLine,
            signal,
          ),
        signal,
      ),
    ),
    pickDirectory: base.system.pickDirectory.handler(({ input, context }) =>
      context.pickDirectory(input),
    ),
    gc: base.system.gc.handler(({ context }) => context.gc()),
  },
  usage: {
    summary: base.usage.summary.handler(({ input, context }) =>
      usageSummary(context.office.model, context.office.clock.now().getTime(), input.sinceHours),
    ),
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
    inspect: base.projects.inspect.handler(({ input }) => inspectRepo(input)),
    create: base.projects.create.handler(({ input, context }) =>
      context.office.execute(HUMAN_ACTOR, (m, ctx) => createProject(m, input, ctx)),
    ),
    update: base.projects.update.handler(({ input, context }) =>
      context.office.execute(HUMAN_ACTOR, (m, ctx) => updateProject(m, input, ctx)),
    ),
    remove: base.projects.remove.handler(async ({ input, context }) => ({
      id: await context.office.execute(HUMAN_ACTOR, (m, ctx) => removeProject(m, input.id, ctx)),
    })),
    sync: base.projects.sync.handler(({ input, context }) =>
      syncProject(context.office, context.home, input.id, input.dryRun),
    ),
    export: base.projects.export.handler(({ input, context }) =>
      exportProject(context.office, input.id),
    ),
  },
  layouts: {
    list: base.layouts.list.handler(({ context }) =>
      listLayouts(context.resources.layoutsDir, (file, reason) => {
        context.log.warn({ file, reason }, "office layout ignored");
      }),
    ),
    save: base.layouts.save.handler(({ input, context }) =>
      saveLayout(context.resources.layoutsDir, input),
    ),
  },
  agents: {
    list: base.agents.list.handler(({ input, context }) =>
      [...context.office.model.agents.values()].filter(
        (a) => input.projectId === undefined || a.projectId === input.projectId,
      ),
    ),
    create: base.agents.create.handler(({ input, context }) =>
      context.office.execute(HUMAN_ACTOR, (m, ctx) => createAgent(m, input, ctx)),
    ),
    update: base.agents.update.handler(({ input, context }) =>
      context.office.execute(HUMAN_ACTOR, (m, ctx) => updateAgent(m, input, ctx)),
    ),
    copy: base.agents.copy.handler(({ input, context }) =>
      context.office.execute(HUMAN_ACTOR, (m, ctx) => copyAgent(m, input, ctx)),
    ),
    remove: base.agents.remove.handler(async ({ input, context }) => ({
      id: await context.office.execute(HUMAN_ACTOR, (m, ctx) => removeAgent(m, input.id, ctx)),
    })),
  },
  tasks: taskRoutes,
  sessions: {
    list: base.sessions.list.handler(({ input, context }) =>
      (input.taskId === undefined
        ? [...context.office.model.sessions.values()]
        : sessionsOfTask(context.office.model, input.taskId)
      ).filter((s) => input.active === undefined || isSessionActive(s.state) === input.active),
    ),
    stream: base.sessions.stream.handler(async function* ({ input, context, signal }) {
      for await (const live of context.sessions.stream(input.sessionId ?? null, signal)) {
        yield live;
      }
    }),
    stop: base.sessions.stop.handler(({ input, context }) => ({
      stopped: context.sessions.stop(input.id),
    })),
  },
  chat: {
    /** With `taskId` the human answers a colleague's question; with `projectId` the floor's boss triages it. */
    send: base.chat.send.handler(({ input, context }) =>
      "taskId" in input
        ? context.office.execute(HUMAN_ACTOR, (m, ctx) =>
            answerQuestion(m, input.taskId, input.text, input.attachments, ctx),
          )
        : context.office.execute(HUMAN_ACTOR, (m, ctx) =>
            triageMessage(m, input.projectId, input.text, input.attachments, ctx),
          ),
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
      logId: await context.office.store.firstId(),
    })),
    subscribe: base.events.subscribe.handler(async function* ({ input, context, signal }) {
      // Subscribe before replaying so nothing appended in between is lost; dedupe on seq.
      const live = context.office.store.subscribe(undefined, signal);
      let last = input.afterSeq ?? -1;
      for await (const event of context.office.store.read(last)) {
        yield event;
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
      try {
        for (;;) {
          yield { at: context.office.clock.now().toISOString() };
          if (await sleepUntilAbort(PRESENCE_BEAT_MS, signal)) {
            return;
          }
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
