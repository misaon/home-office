import { Attachment, attachmentType, errorMessage } from "@ho/protocol";
import { useEffect, useState } from "react";
import { requireToken } from "./rpc.ts";

const PATH = "/attachments";

const base64url = (name: string): string => {
  const bytes = new TextEncoder().encode(name);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const rejects = (file: File): string | null =>
  attachmentType(file.name) === null ? file.name : null;

export async function upload(file: File): Promise<Attachment> {
  const response = await fetch(PATH, {
    method: "POST",
    body: file,
    headers: {
      authorization: `Bearer ${requireToken()}`,
      "x-ho-filename": base64url(file.name),
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return Attachment.parse(await response.json());
}

const objectUrls = new Map<string, Promise<string>>();

function attachmentUrl(attachment: Attachment): Promise<string> {
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

export function useAttachmentUrl(attachment: Attachment, wanted = true): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!wanted) {
      return undefined;
    }
    let live = true;
    attachmentUrl(attachment)
      .then((value) => {
        if (live) {
          setUrl(value);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [attachment, wanted]);
  return url;
}
