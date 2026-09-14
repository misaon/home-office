import type { Actor, DomainError, IsoDateTime, NewEvent } from "@ho/protocol";
import type { IdFactory } from "./ids.ts";
import type { ReadModel } from "./model/read-model.ts";

/** Expected failures are values, not exceptions. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type CommandContext = { ids: IdFactory; now: IsoDateTime; actor: Actor };

/**
 * Commands never touch the model: they return the events to append and how to read the outcome from
 * the model once those events have been applied. The reducer alone decides what an entity looks like.
 */
export type CommandResult<T> = Result<
  { events: NewEvent[]; read: (model: ReadModel) => T },
  DomainError
>;

/** An entity the events just created or changed; its absence after apply is a broken reducer. */
export const entity = <K, V>(entities: ReadonlyMap<K, V>, id: K): V => {
  const found = entities.get(id);
  if (found === undefined) {
    throw new Error(`projection lost ${String(id)}`);
  }
  return found;
};
