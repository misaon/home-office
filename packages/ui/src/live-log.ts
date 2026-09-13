import type { LiveEvent, SessionId } from "@ho/protocol";
import { nextBump, useUi } from "./store.ts";

/** Recent live runtime events per session (the daemon does not persist them either). */
const liveLog = new Map<SessionId, LiveEvent[]>();
const dirty = new Set<SessionId>();
const LIVE_LIMIT = 300;
const LIVE_SESSION_LIMIT = 20;

export function pushLive(event: LiveEvent): void {
  const list = liveLog.get(event.sessionId) ?? [];
  list.push(event);
  if (list.length > LIVE_LIMIT) {
    list.splice(0, list.length - LIVE_LIMIT);
  }
  liveLog.delete(event.sessionId);
  liveLog.set(event.sessionId, list);
  if (liveLog.size > LIVE_SESSION_LIMIT) {
    const oldest = liveLog.keys().next();
    if (oldest.done !== true) {
      liveLog.delete(oldest.value);
      dirty.add(oldest.value);
    }
  }
  dirty.add(event.sessionId);
  scheduleLiveBump();
}

let scheduled = false;
function scheduleLiveBump(): void {
  if (scheduled) {
    return;
  }
  scheduled = true;
  nextBump(() => {
    scheduled = false;
    useUi.setState((s) => {
      const live = new Map(s.live);
      for (const id of dirty) {
        const events = liveLog.get(id);
        if (events === undefined) {
          live.delete(id);
        } else {
          live.set(id, [...events]);
        }
      }
      dirty.clear();
      return { live };
    });
  });
}
