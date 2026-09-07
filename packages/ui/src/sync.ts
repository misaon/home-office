import { applyEvent } from "@ho/core";
import type { Bridge } from "./office/bridge.ts";
import { type Client, connect, resolveToken } from "./rpc.ts";
import { model, pushLive, scheduleLiveBump, scheduleModelBump, useUi } from "./store.ts";

const RETRY_MS = 2000;
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function runEvents(client: Client, bridge: Bridge, signal: AbortSignal): Promise<void> {
  const head = await client.events.head();
  let replayed = model.lastSeq >= head.seq;
  if (replayed) {
    bridge.syncFromModel();
    useUi.getState().setReplayed(true);
  }
  const input = model.lastSeq < 0 ? {} : { afterSeq: model.lastSeq };
  for await (const event of await client.events.subscribe(input, { signal })) {
    applyEvent(model, event);
    scheduleModelBump();
    if (replayed) {
      bridge.onEvent(event);
    } else if (event.seq >= head.seq) {
      replayed = true;
      bridge.syncFromModel();
      useUi.getState().setReplayed(true);
    }
  }
}

async function runLive(client: Client, bridge: Bridge, signal: AbortSignal): Promise<void> {
  for await (const live of await client.sessions.stream({}, { signal })) {
    pushLive(live);
    scheduleLiveBump();
    bridge.onLive(live);
  }
}

async function runPresence(client: Client, signal: AbortSignal): Promise<void> {
  for await (const beat of await client.office.presence(undefined, { signal })) {
    void beat;
  }
}

/** Keeps one authenticated connection alive: replays the log, follows live events, reconnects on loss. */
export async function startSync(bridge: Bridge): Promise<void> {
  let token = resolveToken();
  while (token === null) {
    useUi.getState().setConnection("unauthorized");
    await new Promise<void>((resolve) => {
      window.addEventListener(
        "hashchange",
        () => {
          resolve();
        },
        { once: true },
      );
    });
    token = resolveToken();
  }
  for (;;) {
    useUi.getState().setConnection("connecting");
    // A fresh launch URL (`ho ui` after a daemon restart) supersedes the remembered token.
    token = resolveToken() ?? token;
    try {
      const { client, socket } = await connect(token);
      useUi.getState().setConnection("online");
      bridge.attach(client);
      const controller = new AbortController();
      const closed = new Promise<void>((resolve) => {
        socket.addEventListener(
          "close",
          () => {
            resolve();
          },
          { once: true },
        );
      });
      const swallow = (error: unknown): void => {
        if (!controller.signal.aborted) {
          reportError(error);
        }
      };
      runEvents(client, bridge, controller.signal).catch(swallow);
      runLive(client, bridge, controller.signal).catch(swallow);
      runPresence(client, controller.signal).catch(swallow);
      await closed;
      controller.abort();
      bridge.detach();
    } catch {
      // The daemon is unreachable or rejected the token; retry below.
    }
    useUi.getState().setConnection("offline");
    await wait(RETRY_MS);
  }
}
