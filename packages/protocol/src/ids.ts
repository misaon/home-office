import { z } from "zod";

export const ProjectId = z.uuidv7().brand<"ProjectId">();
export type ProjectId = z.infer<typeof ProjectId>;

export const AgentId = z.uuidv7().brand<"AgentId">();
export type AgentId = z.infer<typeof AgentId>;

export const TaskId = z.uuidv7().brand<"TaskId">();
export type TaskId = z.infer<typeof TaskId>;

export const SessionId = z.uuidv7().brand<"SessionId">();
export type SessionId = z.infer<typeof SessionId>;

export const ChatMessageId = z.uuidv7().brand<"ChatMessageId">();
export type ChatMessageId = z.infer<typeof ChatMessageId>;

export const ChatThreadId = z.uuidv7().brand<"ChatThreadId">();
export type ChatThreadId = z.infer<typeof ChatThreadId>;

export const MailItemId = z.uuidv7().brand<"MailItemId">();
export type MailItemId = z.infer<typeof MailItemId>;

export const MandateId = z.uuidv7().brand<"MandateId">();
export type MandateId = z.infer<typeof MandateId>;

export const EventId = z.uuidv7().brand<"EventId">();
export type EventId = z.infer<typeof EventId>;
