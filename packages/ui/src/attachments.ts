import { Attachment, attachmentType, errorMessage } from "@ho/protocol";
import { requireToken } from "./rpc.ts";

const PATH = "/attachments";

/** A file name as a header value: UTF-8 bytes, base64url, no padding. */
const base64url = (name: string): string => {
  const bytes = new TextEncoder().encode(name);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

/** The name of a file the office does not take, or null when it does. */
export const rejects = (file: File): string | null =>
  attachmentType(file.name) === null ? file.name : null;

/**
 * Uploads one file and returns what a message should carry. The daemon stores it under the hash of its
 * content, so sending the same image twice costs one copy.
 */
export async function upload(file: File): Promise<Attachment> {
  const response = await fetch(PATH, {
    method: "POST",
    body: file,
    headers: {
      authorization: `Bearer ${requireToken()}`,
      // Any file name has to survive a header, and a header is ASCII.
      "x-ho-filename": base64url(file.name),
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return Attachment.parse(await response.json());
}

const objectUrls = new Map<string, Promise<string>>();

/**
 * A URL the page can show an attachment from. The bytes need the daemon's token, which an `<img src>`
 * cannot carry, so they are fetched once and kept as an object URL for as long as the page lives. The
 * type comes from the message's own descriptor: the daemon serves every file as opaque bytes.
 */
export function attachmentUrl(attachment: Attachment): Promise<string> {
  const existing = objectUrls.get(attachment.id);
  if (existing !== undefined) {
    return existing;
  }
  const pending = (async (): Promise<string> => {
    const response = await fetch(`${PATH}/${attachment.id}`, {
      headers: { authorization: `Bearer ${requireToken()}` },
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: attachment.mime }));
  })().catch((error: unknown) => {
    objectUrls.delete(attachment.id);
    throw new Error(errorMessage(error));
  });
  objectUrls.set(attachment.id, pending);
  return pending;
}
