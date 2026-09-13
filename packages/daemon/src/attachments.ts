import { err, ok, type Result } from "@ho/core";
import {
  type Attachment,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_MAX,
  AttachmentName,
  attachmentType,
  conflict,
  type DomainError,
  notFound,
} from "@ho/protocol";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Files the chat carries, kept beside the event log rather than inside it: a log is replayed on every
 * start and by every open office page. A file is named by the SHA-256 of its content, so the same image
 * sent twice is stored once and a retried upload costs nothing.
 */
export class AttachmentStore {
  readonly #dir: string;
  readonly #outbox: string;
  readonly #inbox: string;

  constructor(home: string) {
    this.#dir = join(home, "attachments");
    this.#outbox = join(this.#dir, "outbox");
    this.#inbox = join(this.#dir, "inbox");
  }

  async init(): Promise<void> {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
  }

  /** Stores the bytes under their own hash and returns what a message should carry. */
  async put(name: string, bytes: Uint8Array): Promise<Result<Attachment, DomainError>> {
    const named = AttachmentName.safeParse(name);
    if (!named.success) {
      return err(conflict(`"${name}" is not a plain file name`));
    }
    const mime = attachmentType(named.data);
    if (mime === null) {
      return err(conflict(`the office does not take "${named.data}"`));
    }
    if (bytes.byteLength === 0 || bytes.byteLength > ATTACHMENT_MAX_BYTES) {
      return err(
        conflict(`a file must be between 1 byte and ${String(ATTACHMENT_MAX_BYTES)} bytes`),
      );
    }
    const id = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    await Bun.write(join(this.#dir, id), bytes);
    return ok({ id, name: named.data, mime, bytes: bytes.byteLength });
  }

  /** The stored file, streamed rather than read into memory, or a not-found for an id nobody wrote. */
  async get(id: string): Promise<Result<Blob, DomainError>> {
    if (!/^[a-f\d]{64}$/u.test(id)) {
      return err(notFound("attachment", id));
    }
    const file = Bun.file(join(this.#dir, id));
    return (await file.exists()) ? ok(file) : err(notFound("attachment", id));
  }

  /** The host side of the directory a session writes into; the sandbox sees it as `CHAT_OUTBOX_DIR`. */
  outboxFor(sessionId: string): string {
    return join(this.#outbox, sessionId);
  }

  /**
   * The files the human attached to this task's messages, laid out under their own names for the session
   * to read. The sandbox mounts it read-only as `CHAT_INBOX_DIR`; a name that repeats gets a suffix, so
   * two different files called `spec.pdf` both arrive.
   */
  async fillInbox(sessionId: string, attachments: readonly Attachment[]): Promise<string> {
    const dir = join(this.#inbox, sessionId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const used = new Set<string>();
    for (const attachment of attachments) {
      const dot = attachment.name.lastIndexOf(".");
      const stem = dot === -1 ? attachment.name : attachment.name.slice(0, dot);
      const extension = dot === -1 ? "" : attachment.name.slice(dot);
      let name = attachment.name;
      for (let n = 2; used.has(name); n += 1) {
        name = `${stem}-${String(n)}${extension}`;
      }
      used.add(name);
      const stored = await this.get(attachment.id);
      if (stored.ok) {
        await Bun.write(join(dir, name), stored.value);
      }
    }
    return dir;
  }

  async closeInbox(sessionId: string): Promise<void> {
    await rm(join(this.#inbox, sessionId), { recursive: true, force: true });
  }

  async openOutbox(sessionId: string): Promise<string> {
    const dir = this.outboxFor(sessionId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  async closeOutbox(sessionId: string): Promise<void> {
    await rm(this.outboxFor(sessionId), { recursive: true, force: true });
  }

  /**
   * Takes the named files out of a session's outbox into the store. A name is a plain file name and the
   * resolved path has to stay inside the outbox, so a session cannot reach anything else through it.
   */
  async collect(sessionId: string, names: readonly string[]): Promise<Attachment[]> {
    const dir = resolve(this.outboxFor(sessionId));
    const collected: Attachment[] = [];
    for (const name of names.slice(0, ATTACHMENTS_MAX)) {
      const path = resolve(dir, name);
      if (!path.startsWith(`${dir}/`)) {
        continue;
      }
      const file = Bun.file(path);
      if (!(await file.exists())) {
        continue;
      }
      const stored = await this.put(name, new Uint8Array(await file.arrayBuffer()));
      if (stored.ok) {
        collected.push(stored.value);
      }
    }
    return collected;
  }

  /** What a session left in its outbox; an agent that wrote a file without naming it is not punished. */
  async outboxFiles(sessionId: string): Promise<string[]> {
    try {
      return await readdir(this.outboxFor(sessionId));
    } catch {
      return [];
    }
  }
}
