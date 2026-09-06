import type { RuntimeEvent } from "@ho/protocol";
import type { Emotion } from "./world.ts";

export type EmotionCue = { kind: Emotion; ttlMs: number | null };

const STATIC: Partial<Record<RuntimeEvent["kind"], EmotionCue>> = {
  tool_call: { kind: "focused", ttlMs: 8000 },
  error: { kind: "frustrated", ttlMs: 20000 },
  permission_request: { kind: "question", ttlMs: null },
  rate_limited: { kind: "sleepy", ttlMs: null },
};

/** How live runtime events show up above an agent's head. `null` ttl keeps the bubble until replaced. */
export function emotionFor(event: RuntimeEvent): EmotionCue | null {
  if (event.kind === "tool_result") {
    return event.ok ? null : { kind: "frustrated", ttlMs: 6000 };
  }
  if (event.kind === "result") {
    return event.ok ? { kind: "happy", ttlMs: 6000 } : { kind: "frustrated", ttlMs: 10000 };
  }
  return STATIC[event.kind] ?? null;
}
