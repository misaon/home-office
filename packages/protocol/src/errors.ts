import { z } from "zod";
import { TaskStatus } from "./domain.ts";

const NotFound = z.object({
  entity: z.enum([
    "project",
    "agent",
    "task",
    "session",
    "mail",
    "mandate",
    "attachment",
    "device",
  ]),
  id: z.string(),
});
const Conflict = z.object({ reason: z.string() });
const InvalidTransition = z.object({ from: TaskStatus, to: TaskStatus });

export const DomainError = z.discriminatedUnion("code", [
  NotFound.extend({ code: z.literal("not_found") }),
  Conflict.extend({ code: z.literal("conflict") }),
  InvalidTransition.extend({ code: z.literal("invalid_transition") }),
]);
export type DomainError = z.infer<typeof DomainError>;

export const notFound = (entity: z.infer<typeof NotFound>["entity"], id: string): DomainError => ({
  code: "not_found",
  entity,
  id,
});
export const conflict = (reason: string): DomainError => ({ code: "conflict", reason });

export const describeDomainError = (error: DomainError): string => {
  if (error.code === "not_found") {
    return `${error.entity} ${error.id} not found`;
  }
  if (error.code === "conflict") {
    return error.reason;
  }
  return `cannot move task from ${error.from} to ${error.to}`;
};

export const RPC_ERRORS = {
  NOT_FOUND: { message: "Entity not found", data: NotFound },
  CONFLICT: { message: "The request conflicts with the current state", data: Conflict },
  INVALID_TRANSITION: { message: "Task status transition is not allowed", data: InvalidTransition },
} as const;

export const RPC_ERROR_CODE = {
  not_found: "NOT_FOUND",
  conflict: "CONFLICT",
  invalid_transition: "INVALID_TRANSITION",
} as const satisfies Record<DomainError["code"], keyof typeof RPC_ERRORS>;
