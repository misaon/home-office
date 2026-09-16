import { readdir, readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

const SKILL_NAME_MAX = 64;
const SKILL_DESCRIPTION_MAX = 1024;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const BODY_MAX = 64_000;
const FILE_MAX = 256_000;
const BUNDLED_DIRS = ["scripts", "references", "assets"];

export type SkillIndexEntry = { name: string; description: string };
export type SkillBody = { name: string; description: string; body: string; files: string[] };

const FRONTMATTER = /^---\r?\n(?<yaml>[\s\S]*?)\r?\n---\r?\n?(?<body>[\s\S]*)$/u;

const stringField = (parsed: object, key: string): string | null => {
  const entry = Object.entries(parsed).find(([k]) => k === key);
  const found: unknown = entry === undefined ? undefined : entry[1];
  return typeof found === "string" ? found : null;
};

function parseSkill(
  text: string,
  directory: string,
): { ok: true; value: SkillBody } | { ok: false; reason: string } {
  const match = FRONTMATTER.exec(text);
  const yaml = match?.groups?.["yaml"];
  const body = match?.groups?.["body"];
  if (yaml === undefined || body === undefined) {
    return { ok: false, reason: "no YAML frontmatter between --- markers" };
  }
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(yaml);
  } catch (error) {
    return { ok: false, reason: `frontmatter is not YAML (${String(error)})` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "frontmatter is not a mapping" };
  }
  const name = stringField(parsed, "name");
  const description = stringField(parsed, "description");
  if (name === null || description === null) {
    return { ok: false, reason: "frontmatter needs both `name` and `description`" };
  }
  if (name.length > SKILL_NAME_MAX || !SKILL_NAME.test(name)) {
    return {
      ok: false,
      reason: `name "${name}" must be at most ${String(SKILL_NAME_MAX)} lowercase alphanumeric characters and single hyphens`,
    };
  }
  if (name !== directory) {
    return { ok: false, reason: `name "${name}" must match its directory "${directory}"` };
  }
  if (description === "" || description.length > SKILL_DESCRIPTION_MAX) {
    return {
      ok: false,
      reason: `description must be 1 to ${String(SKILL_DESCRIPTION_MAX)} characters`,
    };
  }
  return { ok: true, value: { name, description, body: body.trim(), files: [] } };
}

const bundledPath = (path: string): string | null => {
  const clean = normalize(path).replaceAll("\\", "/");
  const [head] = clean.split("/");
  return clean.startsWith("/") ||
    clean.includes("..") ||
    head === undefined ||
    !BUNDLED_DIRS.includes(head)
    ? null
    : clean;
};

export class SkillLibrary {
  readonly #root: string | null;

  constructor(root: string | null) {
    this.#root = root;
  }

  get available(): boolean {
    return this.#root !== null;
  }

  #packDir(pack: string): string | null {
    return this.#root === null || pack === "none" || pack.includes("/") || pack.includes("..")
      ? null
      : join(this.#root, pack, "skills");
  }

  async index(pack: string): Promise<SkillIndexEntry[]> {
    const dir = this.#packDir(pack);
    if (dir === null) {
      return [];
    }
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const found: SkillIndexEntry[] = [];
    for (const entry of entries.filter((e) => e.isDirectory())) {
      const text = await readFile(join(dir, entry.name, "SKILL.md"), "utf8").catch(() => null);
      const parsed = text === null ? null : parseSkill(text, entry.name);
      if (parsed?.ok === true) {
        found.push({ name: parsed.value.name, description: parsed.value.description });
      }
    }
    return found.toSorted((a, b) => a.name.localeCompare(b.name));
  }

  async read(pack: string, name: string): Promise<SkillBody> {
    const dir = this.#packDir(pack);
    if (dir === null || !SKILL_NAME.test(name)) {
      throw new Error(`no skill "${name}" in this session`);
    }
    const text = await readFile(join(dir, name, "SKILL.md"), "utf8").catch(() => null);
    const parsed = text === null ? null : parseSkill(text, name);
    if (parsed?.ok !== true) {
      throw new Error(`no skill "${name}" in this session`);
    }
    const files: string[] = [];
    for (const bundled of BUNDLED_DIRS) {
      const entries = await readdir(join(dir, name, bundled), { recursive: true }).catch(() => []);
      files.push(...entries.map((file) => `${bundled}/${file.replaceAll("\\", "/")}`));
    }
    return { ...parsed.value, body: parsed.value.body.slice(0, BODY_MAX), files: files.toSorted() };
  }

  async file(pack: string, name: string, path: string): Promise<string> {
    const dir = this.#packDir(pack);
    const relative = bundledPath(path);
    if (dir === null || !SKILL_NAME.test(name) || relative === null) {
      throw new Error(`no file "${path}" in skill "${name}"`);
    }
    const text = await readFile(join(dir, name, relative), "utf8").catch(() => null);
    if (text === null) {
      throw new Error(`no file "${path}" in skill "${name}"`);
    }
    return text.slice(0, FILE_MAX);
  }
}
