import { err, ok, type Result } from "@ho/core";
import {
  type Attachment,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_MAX,
  AttachmentName,
  attachmentType,
  clip,
  conflict,
  type DomainError,
  notFound,
} from "@ho/protocol";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const CONSOLE_ERROR = /^\s*\[?(?:error|ERROR)\]?[\s:]/u;
const CONSOLE_ERRORS_MAX = 20;
const CONSOLE_LINE_MAX = 300;
const SCREENSHOT = /\.(?:png|jpe?g|webp)$/iu;

export type BrowserDiagnostics = {
  dir: string;
  files: number;
  screenshots: string[];
  consoleErrors: string[];
};

export class AttachmentStore {
  readonly #dir: string;
  readonly #outbox: string;
  readonly #inbox: string;
  readonly #browser: string;

  constructor(home: string) {
    this.#dir = join(home, "attachments");
    this.#outbox = join(this.#dir, "outbox");
    this.#inbox = join(this.#dir, "inbox");
    this.#browser = join(this.#dir, "browser");
  }

  async init(): Promise<void> {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
  }

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

  async get(id: string): Promise<Result<Blob, DomainError>> {
    if (!/^[a-f\d]{64}$/u.test(id)) {
      return err(notFound("attachment", id));
    }
    const file = Bun.file(join(this.#dir, id));
    return (await file.exists()) ? ok(file) : err(notFound("attachment", id));
  }

  outboxFor(sessionId: string): string {
    return join(this.#outbox, sessionId);
  }

  async fillInbox(sessionId: string, attachments: readonly Attachment[]): Promise<string> {
    const dir = join(this.#inbox, sessionId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const used = new Set<string>();
    for (const attachment of attachments) {
      const dot = attachment.name.lastIndexOf(".");
      const stem = dot === -1 ? attachment.name : attachment.name.slice(0, dot);
      const extension = dot === -1 ? "" : attachment.name.slice(dot);
      let { name } = attachment;
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

  async openBrowserDir(sessionId: string): Promise<string> {
    const dir = join(this.#browser, sessionId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  async browserDiagnostics(sessionId: string): Promise<BrowserDiagnostics> {
    const dir = join(this.#browser, sessionId);
    const names = await readdir(dir).catch((): string[] => []);
    const consoleErrors: string[] = [];
    for (const name of names.filter((n) => n.startsWith("console-") && n.endsWith(".log"))) {
      const text = await Bun.file(join(dir, name))
        .text()
        .catch(() => "");
      for (const line of text.split("\n")) {
        if (CONSOLE_ERROR.test(line)) {
          consoleErrors.push(clip(line.trim(), CONSOLE_LINE_MAX));
        }
      }
    }
    return {
      dir,
      files: names.length,
      screenshots: names.filter((name) => SCREENSHOT.test(name)).toSorted(),
      consoleErrors: consoleErrors.slice(0, CONSOLE_ERRORS_MAX),
    };
  }

  async pruneBrowser(days: number): Promise<number> {
    const cutoff = Date.now() - days * DAY_MS;
    let removed = 0;
    for (const name of await readdir(this.#browser).catch((): string[] => [])) {
      const path = join(this.#browser, name);
      const info = await stat(path).catch(() => null);
      if (info !== null && info.mtimeMs < cutoff) {
        await rm(path, { recursive: true, force: true });
        removed += 1;
      }
    }
    return removed;
  }

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
}
