import type { Cancellation } from "./ports.ts";

export type Channel<T> = {
  push: (item: T) => void;
  close: () => void;
  iterate: () => AsyncIterable<T>;
  readonly closed: boolean;
};

/** Unbounded async queue; one producer, one consumer. Closes on cancellation. */
export function createChannel<T>(signal?: Cancellation): Channel<T> {
  const buffer: T[] = [];
  let pending: PromiseWithResolvers<void> | null = null;
  let closed = false;
  const notify = (): void => {
    pending?.resolve();
    pending = null;
  };
  const close = (): void => {
    closed = true;
    notify();
  };
  signal?.addEventListener("abort", close);
  return {
    push: (item) => {
      if (!closed) {
        buffer.push(item);
        notify();
      }
    },
    close,
    get closed() {
      return closed;
    },
    iterate: async function* () {
      for (;;) {
        const next = buffer.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (closed) {
          return;
        }
        pending = Promise.withResolvers<void>();
        await pending.promise;
      }
    },
  };
}
