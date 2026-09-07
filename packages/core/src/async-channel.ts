import type { Cancellation } from "./ports.ts";

export type Channel<T> = {
  push: (item: T) => void;
  close: () => void;
  iterate: () => AsyncIterable<T>;
  readonly closed: boolean;
};

type ChannelOptions = { capacity?: number; onClose?: () => void };

export function createChannel<T>(signal?: Cancellation, options: ChannelOptions = {}): Channel<T> {
  const capacity = options.capacity ?? 1024;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError("channel capacity must be a positive safe integer");
  }
  const buffer = new Map<number, T>();
  let head = 0;
  let tail = 0;
  let pending: PromiseWithResolvers<void> | null = null;
  let closed = false;
  let failure: Error | null = null;
  let iterating = false;
  const notify = (): void => {
    pending?.resolve();
    pending = null;
  };
  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    signal?.removeEventListener("abort", cancel);
    options.onClose?.();
    notify();
  };
  const cancel = (): void => {
    buffer.clear();
    close();
  };
  if (signal?.aborted === true) {
    close();
  } else {
    signal?.addEventListener("abort", cancel);
  }
  return {
    push: (item) => {
      if (closed) {
        return;
      }
      if (buffer.size >= capacity) {
        failure = new Error("stream consumer fell behind; reconnect to resume");
        buffer.clear();
        close();
        return;
      }
      buffer.set(tail++, item);
      notify();
    },
    close,
    get closed() {
      return closed;
    },
    iterate: async function* () {
      if (iterating) {
        throw new Error("a channel supports only one consumer");
      }
      iterating = true;
      try {
        for (;;) {
          if (failure !== null) {
            throw failure;
          }
          if (buffer.size > 0) {
            const entry = buffer.entries().next();
            if (entry.done !== true) {
              buffer.delete(head++);
              yield entry.value[1];
            }
            continue;
          }
          if (closed) {
            return;
          }
          pending = Promise.withResolvers<void>();
          await pending.promise;
        }
      } finally {
        buffer.clear();
        iterating = false;
        close();
      }
    },
  };
}
