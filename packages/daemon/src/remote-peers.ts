import {
  errorMessage,
  REMOTE_HANDSHAKE_TIMEOUT_MS,
  RemoteMessage,
  SecureFrame,
} from "@ho/protocol";
import {
  type HandshakeInputs,
  respondHandshake,
  type SecureChannel,
  textOf,
  utf8,
} from "@ho/remote";

export type RemoteSocket = { send: (message: string | ArrayBufferLike | Uint8Array) => number };

export type RemoteCaller = { id: string; name: string };

export type RemoteDispatcher = {
  message: (socket: RemoteSocket, data: string, device: RemoteCaller) => Promise<void>;
  close: (socket: RemoteSocket) => void;
};

export type SecurePeerOptions = {
  inputs: HandshakeInputs;
  transmit: (data: string) => void;
  onSecured: () => void;
  onMessage: (message: RemoteMessage) => Promise<void>;
  onFailure: (reason: string) => void;
};

type Phase =
  | { kind: "awaiting_hs1" }
  | { kind: "awaiting_hs3"; verify: (hs3: SecureFrame) => Promise<SecureChannel> }
  | { kind: "open"; channel: SecureChannel }
  | { kind: "closed" };

export class SecurePeer {
  readonly #options: SecurePeerOptions;
  readonly #timer: ReturnType<typeof setTimeout>;
  #phase: Phase = { kind: "awaiting_hs1" };
  #inbox: Promise<void> = Promise.resolve();

  constructor(options: SecurePeerOptions) {
    this.#options = options;
    this.#timer = setTimeout(() => {
      this.#fail("the handshake did not finish in time");
    }, REMOTE_HANDSHAKE_TIMEOUT_MS);
  }

  get secured(): boolean {
    return this.#phase.kind === "open";
  }

  receive(data: string): void {
    this.#inbox = this.#inbox
      .then(() => this.#process(data))
      .catch((error: unknown) => {
        this.#fail(errorMessage(error));
      });
  }

  send(message: RemoteMessage): Promise<void> {
    const phase = this.#phase;
    if (phase.kind !== "open") {
      return Promise.reject(new Error("the secure channel is not open"));
    }
    return phase.channel.seal(utf8(JSON.stringify(message)), (frame) => {
      this.#options.transmit(JSON.stringify(frame));
    });
  }

  dispose(): void {
    clearTimeout(this.#timer);
    this.#phase = { kind: "closed" };
  }

  async #process(data: string): Promise<void> {
    const phase = this.#phase;
    if (phase.kind === "closed") {
      return;
    }
    const frame = SecureFrame.parse(JSON.parse(data));
    if (phase.kind === "awaiting_hs1") {
      const response = await respondHandshake(this.#options.inputs, frame);
      this.#phase = { kind: "awaiting_hs3", verify: response.verify };
      this.#options.transmit(JSON.stringify(response.hs2));
      return;
    }
    if (phase.kind === "awaiting_hs3") {
      const channel = await phase.verify(frame);
      clearTimeout(this.#timer);
      this.#phase = { kind: "open", channel };
      this.#options.onSecured();
      return;
    }
    const plaintext = await phase.channel.open(frame);
    await this.#options.onMessage(RemoteMessage.parse(JSON.parse(textOf(plaintext))));
  }

  #fail(reason: string): void {
    if (this.#phase.kind === "closed") {
      return;
    }
    this.dispose();
    this.#options.onFailure(reason);
  }
}
