import { z } from "zod";

// Branded, time-ordered identifiers (UUIDv7). Generation happens in the daemon; the protocol only validates.
export const ProjectId = z.uuidv7().brand<"ProjectId">();
export type ProjectId = z.infer<typeof ProjectId>;

export const AgentId = z.uuidv7().brand<"AgentId">();
export type AgentId = z.infer<typeof AgentId>;

export const TaskId = z.uuidv7().brand<"TaskId">();
export type TaskId = z.infer<typeof TaskId>;

export const SessionId = z.uuidv7().brand<"SessionId">();
export type SessionId = z.infer<typeof SessionId>;

export const EventId = z.uuidv7().brand<"EventId">();
export type EventId = z.infer<typeof EventId>;
