const OPEN = 1;
const CLOSED = 3;

export class TunnelSocket extends EventTarget {
  readyState: 0 | 1 | 2 | 3 = OPEN;
  readonly #transmit: (message: string) => void;

  constructor(transmit: (message: string) => void) {
    super();
    this.#transmit = transmit;
  }

  send(data: string | ArrayBufferLike | ArrayBufferView | Blob): void {
    if (this.readyState !== OPEN) {
      throw new Error("the tunnel is closed");
    }
    if (typeof data === "string") {
      this.#transmit(data);
      return;
    }
    if (data instanceof Blob) {
      throw new TypeError("binary frames are not carried through the tunnel");
    }
    this.#transmit(
      new TextDecoder().decode(
        ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : data,
      ),
    );
  }

  receive(message: string): void {
    if (this.readyState === OPEN) {
      this.dispatchEvent(new MessageEvent("message", { data: message }));
    }
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === CLOSED) {
      return;
    }
    this.readyState = CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code, reason }));
  }
}
