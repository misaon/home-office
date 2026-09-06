import { z } from "zod";

// Branded, time-ordered identifiers (UUIDv7). Generation lives in @ho/core; the protocol only validates.
export const ProjectId = z.uuidv7().brand<"ProjectId">();
export type ProjectId = z.infer<typeof ProjectId>;

export const AgentId = z.uuidv7().brand<"AgentId">();
export type AgentId = z.infer<typeof AgentId>;

export const TaskId = z.uuidv7().brand<"TaskId">();
export type TaskId = z.infer<typeof TaskId>;

export const SessionId = z.uuidv7().brand<"SessionId">();
export type SessionId = z.infer<typeof SessionId>;

export const HandoffId = z.uuidv7().brand<"HandoffId">();
export type HandoffId = z.infer<typeof HandoffId>;

export const ChatMessageId = z.uuidv7().brand<"ChatMessageId">();
export type ChatMessageId = z.infer<typeof ChatMessageId>;

export const MailItemId = z.uuidv7().brand<"MailItemId">();
export type MailItemId = z.infer<typeof MailItemId>;

export const EventId = z.uuidv7().brand<"EventId">();
export type EventId = z.infer<typeof EventId>;
