import { createChannel, waitForOpen } from "@ho/core";
import {
  type InstanceToRelay,
  type PeerToRelay,
  REMOTE_HANDSHAKE_TIMEOUT_MS,
  type RelayHello,
  RelayToClient,
} from "@ho/protocol";
import { type Bytes, fromBase64Url } from "./bytes.ts";

type RelayWebSocket = Pick<
  WebSocket,
  "send" | "close" | "addEventListener" | "removeEventListener" | "readyState"
>;
export type WebSocketFactory = (url: string) => RelayWebSocket;

export type RelaySession = {
  send: (frame: InstanceToRelay | PeerToRelay) => void;
  next: () => Promise<RelayToClient>;
  close: () => void;
  closed: Promise<void>;
};

const FRAME_BUFFER = 4096;

const defaultFactory: WebSocketFactory = (url) => new WebSocket(url);

export async function openRelay(
  url: string,
  hello: (nonce: Bytes) => Promise<RelayHello>,
  factory: WebSocketFactory = defaultFactory,
): Promise<RelaySession> {
  const socket = factory(url);
  const frames = createChannel<RelayToClient>(undefined, { capacity: FRAME_BUFFER });
  const closed = Promise.withResolvers<void>();
  socket.addEventListener("message", (event) => {
    const data: unknown = event.data;
    if (typeof data !== "string") {
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = RelayToClient.safeParse(json);
    if (parsed.success) {
      frames.push(parsed.data);
    }
  });
  socket.addEventListener("close", () => {
    frames.close();
    closed.resolve();
  });
  socket.addEventListener("error", () => {
    frames.close();
  });
  await waitForOpen(
    socket,
    AbortSignal.timeout(REMOTE_HANDSHAKE_TIMEOUT_MS),
    `cannot reach the relay at ${url}`,
  );
  const iterator = frames.iterate()[Symbol.asyncIterator]();
  const receive = async (): Promise<RelayToClient> => {
    const step = await iterator.next();
    if (step.done === true) {
      throw new Error("the relay closed the connection");
    }
    if (step.value.t === "error") {
      throw new Error(
        `the relay refused the connection: ${step.value.code} (${step.value.message})`,
      );
    }
    return step.value;
  };
  const challenge = await receive();
  if (challenge.t !== "challenge") {
    throw new Error("the relay did not open with a challenge");
  }
  socket.send(JSON.stringify(await hello(fromBase64Url(challenge.nonce))));
  const welcome = await receive();
  if (welcome.t !== "welcome") {
    throw new Error("the relay did not accept this connection");
  }
  return {
    send: (frame) => {
      socket.send(JSON.stringify(frame));
    },
    next: receive,
    close: () => {
      socket.close();
    },
    closed: closed.promise,
  };
}
