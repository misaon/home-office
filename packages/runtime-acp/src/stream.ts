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

/**
 * Adapts the runner relay (stdin/stdout lines of the agent process inside the sandbox) to the SDK's
 * bidirectional message stream: outbound JSON-RPC messages become stdin lines, stdout lines that parse as
 * JSON become inbound messages, everything else (banners, logs) goes to `onStderr`. `exited` resolves with
 * the child's exit code once the relay reports it (null when the relay closed first).
 */
export function channelStream(
  channel: RunnerChannel,
  onStderr: (text: string) => void,
): { stream: Stream; exited: Promise<number | null> } {
  const exit = Promise.withResolvers<number | null>();
  const writable = new WritableStream<AnyMessage>({
    write(message) {
      channel.write(`${JSON.stringify(message)}\n`);
    },
    close() {
      channel.closeStdin();
    },
  });
  async function* messages(): AsyncGenerator<AnyMessage> {
    for await (const line of channel.lines()) {
      if (line.stream === "exit") {
        exit.resolve(line.code);
        return;
      }
      const text = line.text.trim();
      if (line.stream === "stderr" || text === "") {
        if (text !== "") {
          onStderr(text);
        }
        continue;
      }
      const parsed = parseMessage(text);
      if (parsed === null) {
        onStderr(text);
      } else {
        yield parsed;
      }
    }
    exit.resolve(null);
  }
  const iterator = messages();
  const readable = new ReadableStream<AnyMessage>({
    async pull(controller) {
      try {
        const step = await iterator.next();
        if (step.done === true) {
          controller.close();
        } else {
          controller.enqueue(step.value);
        }
      } catch (error) {
        exit.resolve(null);
        controller.error(error);
      }
    },
    cancel() {
      exit.resolve(null);
      return iterator.return(undefined).then(() => undefined);
    },
  });
  return { stream: { writable, readable }, exited: exit.promise };
}
