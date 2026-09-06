import { AgentId, ChatMessageId, EventId, ProjectId, SessionId, TaskId } from "@ho/protocol";
import type { Clock, Randomness } from "./ports.ts";

const HEX: string[] = [];
for (let i = 0; i < 256; i += 1) {
  HEX.push(i.toString(16).padStart(2, "0"));
}

/** RFC 9562 UUIDv7: 48-bit unix milliseconds, then random bits. Sortable by creation time. */
export function uuidv7(clock: Clock, random: Randomness): string {
  const bytes = new Uint8Array(16);
  random.randomize(bytes);
  let ms = clock.now().getTime();
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  let hex = "";
  for (const byte of bytes) {
    hex += HEX[byte] ?? "00";
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type IdFactory = {
  project: () => ProjectId;
  agent: () => AgentId;
  task: () => TaskId;
  session: () => SessionId;
  chatMessage: () => ChatMessageId;
  event: () => EventId;
};

export const createIdFactory = (clock: Clock, random: Randomness): IdFactory => {
  const next = (): string => uuidv7(clock, random);
  return {
    project: () => ProjectId.parse(next()),
    agent: () => AgentId.parse(next()),
    task: () => TaskId.parse(next()),
    session: () => SessionId.parse(next()),
    chatMessage: () => ChatMessageId.parse(next()),
    event: () => EventId.parse(next()),
  };
};
