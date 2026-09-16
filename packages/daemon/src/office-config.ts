import { applyOfficeFile, membersOf, mergeOfficeFile, officeFileFrom } from "@ho/core";
import {
  errorMessage,
  OFFICE_DIR,
  OFFICE_FILE,
  OFFICE_LOCAL_FILE,
  OfficeFile,
  type OfficeFileExport,
  type OfficeFileSync,
  type Project,
  type ProjectId,
  SYSTEM_ACTOR,
} from "@ho/protocol";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prettifyError } from "zod";
import { DomainFailureError } from "./domain-failure.ts";
import { exec } from "./host-exec.ts";
import { sourcePathFor } from "./mirrors.ts";
import type { Office } from "./office.ts";

const GIT_TIMEOUT_MS = 15_000;

/** A parsed file, the path it was read from, and the reason the office could not use it. */
type Loaded = { file: OfficeFile | null; source: string | null; problem: string | null };

const NONE: Loaded = { file: null, source: null, problem: null };

const parse = (text: string, where: string): Loaded => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { file: null, source: where, problem: `${where}: ${errorMessage(error)}` };
  }
  const parsed = OfficeFile.safeParse(json);
  return parsed.success
    ? { file: parsed.data, source: where, problem: null }
    : {
        file: null,
        source: where,
        problem: `${where}: ${prettifyError(parsed.error).replaceAll("✖ ", "")}`,
      };
};

/** A file that is not there is not a failure: a repository may say nothing about its floor. */
const readWorkingTree = async (root: string, name: string): Promise<Loaded> => {
  const path = join(root, OFFICE_DIR, name);
  const text = await readFile(path, "utf8").catch(() => null);
  return text === null ? NONE : parse(text, path);
};

/**
 * The committed file as the default branch has it. A task branch is never read, so a running task
 * cannot change its own budget halfway through itself; the security effect of that is a side benefit.
 */
async function readMirror(mirror: string, branch: string, name: string): Promise<Loaded> {
  const where = `${branch}:${OFFICE_DIR}/${name}`;
  const shown = await exec(["git", "-C", mirror, "show", where], { timeoutMs: GIT_TIMEOUT_MS });
  return shown.code === 0 ? parse(shown.stdout, where) : NONE;
}

const layered = (committed: Loaded, local: Loaded): Loaded => {
  if (committed.file === null || local.file === null) {
    return local.file === null && local.problem !== null ? local : committed;
  }
  return {
    file: mergeOfficeFile(committed.file, local.file),
    source: `${committed.source ?? OFFICE_FILE} + ${OFFICE_LOCAL_FILE}`,
    problem: null,
  };
};

/**
 * The floor's own configuration: `.ho/config.json` with `.ho/config.local.json` layered over it. A
 * local checkout is read from its working tree, so editing the file feels immediate — including on a
 * feature branch, which is what reading a working tree means. A mirrored repository is fetched first
 * and read from its default branch, where there is no untracked overlay to find.
 */
async function readOfficeFile(home: string, project: Project): Promise<Loaded> {
  if (project.repo.kind !== "local") {
    const mirror = await sourcePathFor(home, project);
    return readMirror(mirror, project.defaultBranch, OFFICE_FILE);
  }
  const committed = await readWorkingTree(project.repo.path, OFFICE_FILE);
  if (committed.file === null) {
    return committed;
  }
  return layered(committed, await readWorkingTree(project.repo.path, OFFICE_LOCAL_FILE));
}

const quiet = (
  projectId: ProjectId,
  source: string | null,
  problem: string | null,
): OfficeFileSync => ({
  projectId,
  source,
  applied: false,
  changes: [],
  problems: problem === null ? [] : [problem],
});

const mustFind = (office: Office, projectId: ProjectId): Project => {
  const project = office.model.projects.get(projectId);
  if (project === undefined) {
    throw new DomainFailureError({ code: "not_found", entity: "project", id: projectId });
  }
  return project;
};

/**
 * Reads the floor's file and applies it as `system`, so everything it changes is in the log like any
 * other change. `dryRun` plans the same diff and appends nothing.
 */
export async function syncProject(
  office: Office,
  home: string,
  projectId: ProjectId,
  dryRun: boolean,
): Promise<OfficeFileSync> {
  const project = mustFind(office, projectId);
  const loaded = await readOfficeFile(home, project).catch((error: unknown): Loaded => ({
    file: null,
    source: null,
    problem: errorMessage(error),
  }));
  if (loaded.file === null) {
    return quiet(projectId, loaded.source, loaded.problem);
  }
  const { file, source } = loaded;
  return office.execute(SYSTEM_ACTOR, (model, ctx) =>
    applyOfficeFile(model, projectId, file, { source, dryRun }, ctx),
  );
}

/**
 * Writes the floor into its repository. A mirrored repository has no working tree to write into, so
 * the export needs a local checkout and says so rather than writing somewhere invisible.
 */
export async function exportProject(
  office: Office,
  projectId: ProjectId,
): Promise<OfficeFileExport> {
  const project = mustFind(office, projectId);
  if (project.repo.kind !== "local") {
    throw new DomainFailureError({
      code: "conflict",
      reason: `${project.name} is a mirrored repository; writing ${OFFICE_DIR}/${OFFICE_FILE} needs a local checkout`,
    });
  }
  const file = officeFileFrom(project, membersOf(office.model, projectId));
  const directory = join(project.repo.path, OFFICE_DIR);
  await mkdir(directory, { recursive: true });
  const path = join(directory, OFFICE_FILE);
  const text = `${JSON.stringify(file, null, 2)}\n`;
  await writeFile(path, text, "utf8");
  return { projectId, path, bytes: Buffer.byteLength(text, "utf8") };
}
