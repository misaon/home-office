import type { Stream } from "@agentclientprotocol/sdk";
import type { RunnerChannel } from "@ho/core";

type AnyMessage = Stream["readable"] extends ReadableStream<infer T> ? T : never;

const isMessage = (value: unknown): value is AnyMessage =>
  typeof value === "object" && value !== null && "jsonrpc" in value;

/** A stdout line as a JSON-RPC message, or null for anything that is not one (banners, logs). */
const parseMessage = (line: string): AnyMessage | null => {
  try {
    const value: unknown = JSON.parse(line);
    return isMessage(value) ? value : null;
  } catch {
    return null;
  }
};

export type ChannelStream = {
  stream: Stream;
  /** Resolves with the exit code once the agent process is gone (null when the relay closed first). */
  exited: Promise<number | null>;
};

/**
 * Adapts the runner relay (stdin/stdout lines of the agent process inside the sandbox) to the SDK's
 * bidirectional message stream: outbound JSON-RPC messages become stdin lines, stdout lines that parse as
 * JSON become inbound messages, everything else (banners, logs) goes to `onStderr`.
 */
export function channelStream(
  channel: RunnerChannel,
  onStderr: (text: string) => void,
): ChannelStream {
  const exit = Promise.withResolvers<number | null>();
  const resolveExit = exit.resolve;
  const exited = exit.promise;
  const writable = new WritableStream<AnyMessage>({
    write(message) {
      channel.write(`${JSON.stringify(message)}\n`);
    },
    close() {
      channel.closeStdin();
    },
  });
  const iterator = channel.lines()[Symbol.asyncIterator]();
  const state = { closed: false };
  const isClosed = (): boolean => state.closed;
  const readable = new ReadableStream<AnyMessage>({
    async pull(controller) {
      try {
        while (!isClosed()) {
          const step = await iterator.next();
          if (isClosed()) {
            return;
          }
          if (step.done === true || step.value.stream === "exit") {
            state.closed = true;
            resolveExit(
              step.done !== true && step.value.stream === "exit" ? step.value.code : null,
            );
            controller.close();
            return;
          }
          const line = step.value;
          if (line.stream === "stderr") {
            onStderr(line.text);
            continue;
          }
          const trimmed = line.text.trim();
          if (trimmed === "") {
            continue;
          }
          const parsed = parseMessage(trimmed);
          if (parsed === null) {
            onStderr(trimmed);
          } else {
            controller.enqueue(parsed);
            return;
          }
        }
      } catch (error) {
        state.closed = true;
        resolveExit(null);
        controller.error(error);
      }
    },
    cancel() {
      state.closed = true;
      resolveExit(null);
      return iterator.return?.().then(() => undefined);
    },
  });
  return { stream: { writable, readable }, exited };
}
