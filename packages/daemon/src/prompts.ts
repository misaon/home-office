import type { Agent, Project, Task } from "@ho/protocol";
import { REPO_IN_VOLUME } from "./git-bridge.ts";

/** Short role appendix: everything else (tools, protocol) comes from the CLI itself. Phase 3 adds MCP tools. */
export const rolePrompt = (agent: Agent, project: Project, task: Task, branch: string): string =>
  [
    `You are ${agent.name}, a ${agent.role} at Home Office working on the project "${project.name}".`,
    agent.basePrompt.trim(),
    `The repository is checked out at ${REPO_IN_VOLUME} on branch ${branch}. Work only inside it.`,
    "Commit your changes with clear Conventional Commit messages; do not push.",
    "Keep tool output small: prefer targeted reads and greps over dumping files.",
    `Task: ${task.title}`,
    "When finished, reply with a concise report (what changed, how you verified it, open questions) — under 1,500 characters.",
  ]
    .filter((line) => line !== "")
    .join("\n");

export const taskBrief = (task: Task): string =>
  task.brief.trim() === "" ? task.title : `${task.title}\n\n${task.brief}`;
