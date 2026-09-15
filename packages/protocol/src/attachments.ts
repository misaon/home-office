import { z } from "zod";

/**
 * Where a session writes what it wants to send to the office chat. The daemon binds a directory of its own
 * here, so a file written inside the sandbox is readable on the host without leaving the sandbox open.
 */
export const CHAT_OUTBOX_DIR = "/out/chat";

/** Where a session finds the files the human attached to the messages of its task. Read-only. */
export const CHAT_INBOX_DIR = "/in/chat";

/** One file per message is generous for a chat; ten is the point where the bubble stops being readable. */
export const ATTACHMENTS_MAX = 10;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * What the office accepts and, more importantly, what it serves back: the daemon answers with the type it
 * recorded here, never with one sniffed from the bytes. SVG is deliberately absent — it is a script vector.
 */
const ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
};

/** The type of a file name, or null when the office does not take that kind of file. */
export const attachmentType = (name: string): string | null => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? null : (ATTACHMENT_TYPES[name.slice(dot + 1).toLowerCase()] ?? null);
};

export const isImageType = (mime: string): boolean => mime.startsWith("image/");

/** A plain file name: no directory, no traversal, nothing hidden. */
export const AttachmentName = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^/\\]+$/u, "a file name, not a path")
  .refine((name) => !name.startsWith("."), "a file name cannot start with a dot");

/**
 * What an event says about a file. The bytes live beside the log under the office's state directory, named
 * by `id`, which is their SHA-256: the same file uploaded twice is stored once.
 */
export const Attachment = z.object({
  id: z.string().regex(/^[a-f\d]{64}$/u),
  name: AttachmentName,
  mime: z.string().min(1).max(100),
  bytes: z.int().positive().max(ATTACHMENT_MAX_BYTES),
});
export type Attachment = z.infer<typeof Attachment>;

/** Attachments as a message carries them; absent in every event written before 2026-09-13. */
export const Attachments = z.array(Attachment).max(ATTACHMENTS_MAX).prefault([]);
