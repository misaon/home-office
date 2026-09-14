const MAX_LINE_CHARS = 1024 * 1024;

export async function pumpLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  onOverflow?: () => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      onLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    // What is left is one unterminated line; a child that never breaks its output is the failure here.
    if (buffer.length > MAX_LINE_CHARS) {
      onOverflow?.();
      throw new Error("agent output line exceeds 1 MiB");
    }
  }
  buffer += decoder.decode();
  if (buffer.length > 0) {
    onLine(buffer);
  }
}

export async function pumpText(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    onText(decoder.decode(chunk, { stream: true }));
  }
  const remaining = decoder.decode();
  if (remaining !== "") {
    onText(remaining);
  }
}
