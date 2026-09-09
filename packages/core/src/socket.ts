import type { Cancellation } from "./ports.ts";

export const HANDSHAKE_TIMEOUT_MS = 10_000;

export type SocketEvent = "open" | "error" | "close";

export type HandshakeSocket = {
  addEventListener: (type: SocketEvent, listener: () => void) => void;
  removeEventListener: (type: SocketEvent, listener: () => void) => void;
  close: () => void;
};

export function waitForOpen(
  socket: HandshakeSocket,
  deadline: Cancellation,
  failure: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      deadline.removeEventListener("abort", fail);
      socket.removeEventListener("open", open);
      socket.removeEventListener("error", fail);
      socket.removeEventListener("close", fail);
    };
    const open = (): void => {
      cleanup();
      resolve();
    };
    const fail = (): void => {
      cleanup();
      socket.close();
      reject(new Error(failure));
    };
    if (deadline.aborted) {
      fail();
      return;
    }
    deadline.addEventListener("abort", fail);
    socket.addEventListener("open", open);
    socket.addEventListener("error", fail);
    socket.addEventListener("close", fail);
  });
}
