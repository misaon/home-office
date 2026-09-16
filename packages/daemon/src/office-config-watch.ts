import { errorMessage, OFFICE_DIR, type Project, type ProjectId } from "@ho/protocol";
import { existsSync, type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./logger.ts";
import { syncProject } from "./office-config.ts";
import { followEvents, type Office } from "./office.ts";

const DEBOUNCE_MS = 1000;

type Timer = ReturnType<typeof setTimeout>;

export class OfficeConfigSync {
  readonly #office: Office;
  readonly #home: string;
  readonly #log: Logger;
  readonly #watchers = new Map<ProjectId, FSWatcher>();
  readonly #timers = new Map<ProjectId, Timer>();
  #follow: { stop: () => Promise<void> } | null = null;
  #initial: Promise<void> = Promise.resolve();
  #stopped = false;

  constructor(office: Office, home: string, log: Logger) {
    this.#office = office;
    this.#home = home;
    this.#log = log;
  }

  start(): void {
    this.#follow = followEvents(
      this.#office,
      ["project.created", "project.removed"],
      async (event) => {
        if (event.type === "project.created") {
          this.#arm(event.payload.project);
          await this.#apply(event.payload.project.id, "created");
        } else if (event.type === "project.removed") {
          this.#disarm(event.payload.projectId);
        }
      },
      this.#log,
      "office file sync",
    );
    const projects = [...this.#office.model.projects.values()];
    for (const project of projects) {
      this.#arm(project);
    }
    this.#initial = this.#firstPass(projects);
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#follow?.stop();
    for (const watcher of this.#watchers.values()) {
      watcher.close();
    }
    this.#watchers.clear();
    for (const timer of this.#timers.values()) {
      clearTimeout(timer);
    }
    this.#timers.clear();
    await this.#initial;
  }

  async #firstPass(projects: readonly Project[]): Promise<void> {
    for (const project of projects) {
      if (this.#stopped) {
        return;
      }
      await this.#apply(project.id, "start");
    }
  }

  async #apply(projectId: ProjectId, why: string): Promise<void> {
    try {
      const result = await syncProject(this.#office, this.#home, projectId, false);
      if (result.changes.length === 0 && result.problems.length === 0) {
        return;
      }
      this.#log.info(
        { projectId, why, source: result.source, changes: result.changes },
        "office file applied",
      );
      for (const problem of result.problems) {
        this.#log.warn({ projectId, problem }, "office file not fully applied");
      }
    } catch (error) {
      this.#log.warn({ projectId, why, err: errorMessage(error) }, "office file failed");
    }
  }

  #arm(project: Project): void {
    if (this.#stopped || project.repo.kind !== "local") {
      return;
    }
    this.#disarm(project.id);
    const root = project.repo.path;
    const waiting = !existsSync(join(root, OFFICE_DIR));
    try {
      const watcher = watch(waiting ? root : join(root, OFFICE_DIR), { persistent: false }, () => {
        this.#bump(project, waiting);
      });
      watcher.on("error", () => {
        this.#disarm(project.id);
      });
      this.#watchers.set(project.id, watcher);
    } catch (error) {
      this.#log.debug(
        { projectId: project.id, err: errorMessage(error) },
        "office file is not watched",
      );
    }
  }

  #disarm(projectId: ProjectId): void {
    this.#watchers.get(projectId)?.close();
    this.#watchers.delete(projectId);
    const timer = this.#timers.get(projectId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#timers.delete(projectId);
    }
  }

  #bump(project: Project, waiting: boolean): void {
    const running = this.#timers.get(project.id);
    if (running !== undefined) {
      clearTimeout(running);
    }
    this.#timers.set(
      project.id,
      setTimeout(() => {
        this.#timers.delete(project.id);
        if (this.#stopped || project.repo.kind !== "local") {
          return;
        }
        if (waiting) {
          if (!existsSync(join(project.repo.path, OFFICE_DIR))) {
            return;
          }
          this.#arm(project);
        }
        void this.#apply(project.id, "watch");
      }, DEBOUNCE_MS),
    );
  }
}
