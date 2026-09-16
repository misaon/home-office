import type { Actor, DomainError, IsoDateTime, NewEvent } from "@ho/protocol";
import type { IdFactory } from "./ids.ts";
import type { ReadModel } from "./model/read-model.ts";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type CommandContext = { ids: IdFactory; now: IsoDateTime; actor: Actor };

export type CommandResult<T> = Result<
  { events: NewEvent[]; read: (model: ReadModel) => T },
  DomainError
>;

export const entity = <K, V>(entities: ReadonlyMap<K, V>, id: K): V => {
  const found = entities.get(id);
  if (found === undefined) {
    throw new Error(`projection lost ${String(id)}`);
  }
  return found;
};
