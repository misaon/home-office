import type { Actor, IsoDateTime, NewEvent } from "@ho/protocol";
import type { DomainError } from "../errors.ts";
import type { IdFactory } from "../ids.ts";
import type { Result } from "../result.ts";

export type CommandContext = { ids: IdFactory; now: IsoDateTime; actor: Actor };

/** Commands never touch the model; they return the events to append and the entity as it will look. */
export type CommandResult<T> = Result<{ events: NewEvent[]; value: T }, DomainError>;
