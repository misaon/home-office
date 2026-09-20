import type { SandboxHandle } from "@ho/core";
import { errorMessage, servicesAvailable } from "@ho/protocol";
import type { Services } from "./prompts-shared.ts";
import type { SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";
import { startTaskEngine, type TaskEnginePlan, type TaskEngineRequest } from "./task-engine.ts";

const ENGINE_STOP_GRACE_S = 15;

export type Engine = { services: Services; stop: () => Promise<void> };

export async function startServices(
  deps: SessionDeps,
  ctx: SessionContext,
  request: TaskEngineRequest | null,
  plan: TaskEnginePlan | null,
  sandbox: SandboxHandle,
  stack: AsyncDisposableStack,
): Promise<Engine> {
  const none = { stop: () => Promise.resolve() };
  if (request === null || plan === null) {
    const wanted =
      deps.config.services.enabled &&
      ctx.project.services.enabled &&
      (ctx.session.mode === "work" || ctx.session.mode === "review");
    return {
      ...none,
      services:
        wanted && !servicesAvailable(ctx.project.services)
          ? { kind: "untrusted" }
          : { kind: "off" },
    };
  }
  try {
    const engine = await startTaskEngine(deps.provider, deps.config, request, plan, sandbox);
    let stopped: Promise<void> | null = null;
    const stop = (): Promise<void> => {
      stopped ??= (async () => {
        await deps.provider.stop(engine, ENGINE_STOP_GRACE_S).catch(() => null);
        await deps.provider.remove(engine).catch(() => null);
      })();
      return stopped;
    };
    stack.defer(stop);
    return { services: { kind: "ready" }, stop };
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    deps.log.warn(
      { sessionId: ctx.session.id, err: message },
      "task engine did not start; the session continues without its services",
    );
    return { ...none, services: { kind: "failed", message } };
  }
}
