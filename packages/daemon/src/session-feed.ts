import { createChannel } from "@ho/core";
import type { LiveEvent, RuntimeEvent, SessionId } from "@ho/protocol";

type Subscriber = { sessionId: SessionId | null; push: (event: LiveEvent) => void };

export class LiveFeed {
  readonly #subscribers = new Set<Subscriber>();
  readonly #now: () => Date;

  constructor(now: () => Date) {
    this.#now = now;
  }

  stream(sessionId: SessionId | null, signal?: AbortSignal): AsyncIterable<LiveEvent> {
    const subscriber: Subscriber = {
      sessionId,
      push: (event) => {
        channel.push(event);
      },
    };
    const channel = createChannel<LiveEvent>(signal, {
      onClose: () => {
        this.#subscribers.delete(subscriber);
      },
    });
    if (!channel.closed) {
      this.#subscribers.add(subscriber);
    }
    return channel.iterate();
  }

  push(sessionId: SessionId, event: RuntimeEvent): void {
    const live: LiveEvent = { sessionId, at: this.#now().toISOString(), event };
    for (const subscriber of this.#subscribers) {
      if (subscriber.sessionId === null || subscriber.sessionId === sessionId) {
        subscriber.push(live);
      }
    }
  }
}
