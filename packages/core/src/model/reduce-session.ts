import { addUsage, compact, isSessionActive, type Session, type StoredEvent } from "@ho/protocol";
import { indexInto, RATE_LIMIT_TAIL, RATE_LIMITED, type ReadModel } from "./read-model.ts";

type SessionEvent = Extract<StoredEvent, { type: `session.${string}` }>;

const trackSessionState = (model: ReadModel, session: Session): void => {
  if (isSessionActive(session.state)) {
    model.activeSessions.add(session.id);
    return;
  }
  model.activeSessions.delete(session.id);
};

const runtimeAfter = (
  session: Session,
  payload: Extract<SessionEvent, { type: "session.state_changed" }>["payload"],
): Session["runtime"] => {
  const runtime = payload.runtime ?? session.runtime;
  if (runtime === undefined) {
    return undefined;
  }
  return {
    ...runtime,
    ...compact({
      confirmedModel: payload.confirmed?.model ?? runtime.confirmedModel,
      confirmedEffort: payload.confirmed?.effort ?? runtime.confirmedEffort,
    }),
  };
};

export function applySessionEvent(model: ReadModel, event: SessionEvent): void {
  if (event.type === "session.started") {
    const started = event.payload.session;
    model.sessions.set(started.id, started);
    indexInto(model.sessionsByTask, started.taskId, started.id);
    indexInto(model.sessionsByAgent, started.agentId, started.id);
    trackSessionState(model, started);
    return;
  }
  const session = model.sessions.get(event.payload.sessionId);
  if (session === undefined) {
    return;
  }
  switch (event.type) {
    case "session.state_changed": {
      const { state, runtimeSessionId, sandboxId, services } = event.payload;
      if (event.payload.reason?.startsWith(RATE_LIMITED) === true) {
        model.rateLimitsSeen += 1;
        model.rateLimits.push(event.at);
        if (model.rateLimits.length > RATE_LIMIT_TAIL) {
          model.rateLimits.splice(0, model.rateLimits.length - RATE_LIMIT_TAIL);
        }
      }
      const next = {
        ...session,
        state,
        ...compact({
          runtimeSessionId,
          sandboxId,
          services,
          runtime: runtimeAfter(session, event.payload),
        }),
      };
      model.sessions.set(session.id, next);
      trackSessionState(model, next);
      break;
    }
    case "session.usage_recorded": {
      model.sessions.set(session.id, {
        ...session,
        usage: addUsage(session.usage, event.payload.usage),
        ...compact({
          costUsd: event.payload.costUsd ?? session.costUsd,
          costBasis: event.payload.costBasis ?? session.costBasis,
        }),
      });
      break;
    }
    case "session.ended": {
      const ended = { ...session, state: event.payload.state, endedAt: event.payload.endedAt };
      model.sessions.set(session.id, ended);
      trackSessionState(model, ended);
      break;
    }
    case "session.plan_recorded": {
      model.sessions.set(session.id, { ...session, planPercent: event.payload.percent });
      break;
    }
  }
}
