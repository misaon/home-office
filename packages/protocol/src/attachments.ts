import { z } from "zod";

export const CHAT_OUTBOX_DIR = "/out/chat";

export const CHAT_INBOX_DIR = "/in/chat";

export const ATTACHMENTS_MAX = 10;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

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

export const attachmentType = (name: string): string | null => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? null : (ATTACHMENT_TYPES[name.slice(dot + 1).toLowerCase()] ?? null);
};

export const isImageType = (mime: string): boolean => mime.startsWith("image/");

export const AttachmentName = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^/\\]+$/u, "a file name, not a path")
  .refine((name) => !name.startsWith("."), "a file name cannot start with a dot");

export const Attachment = z.object({
  id: z.string().regex(/^[a-f\d]{64}$/u),
  name: AttachmentName,
  mime: z.string().min(1).max(100),
  bytes: z.int().positive().max(ATTACHMENT_MAX_BYTES),
});
export type Attachment = z.infer<typeof Attachment>;

export const Attachments = z.array(Attachment).max(ATTACHMENTS_MAX).prefault([]);
