import type {
  Actor,
  AgentId,
  Attachment,
  HoReportInput,
  MandateId,
  ProjectId,
  ProviderId,
  SessionId,
  SessionMode,
  TaskId,
} from "@ho/protocol";
import type { z } from "zod";
import type { AttachmentStore } from "./attachments.ts";
import type { Commands } from "./office.ts";
import type { SkillLibrary } from "./skills.ts";

export type McpSessionContext = {
  sessionId: SessionId;
  skillPacks: readonly string[];
  taskId: TaskId;
  mandateId: MandateId | undefined;
  agentId: AgentId;
  projectId: ProjectId;
  provider: ProviderId;
  mode: SessionMode;
  attachments: AttachmentStore;
  home: string;
};

export type Entry = {
  ctx: McpSessionContext;
  replied: boolean;
  delegated: boolean;
  applicationReady: boolean;
  report: HoReportInput | null;
  reportFiles: Attachment[];
  skills: SkillLibrary;
};
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: true };
export type Tool<S extends z.ZodObject> = {
  name: string;
  description: string;
  schema: S;
  modes: readonly SessionMode[];
  servesSkills?: true;
  run: (input: z.infer<S>, office: Commands, entry: Entry, actor: Actor) => Promise<unknown>;
};
export type AnyTool = {
  name: string;
  description: string;
  schema: z.ZodObject;
  modes: readonly SessionMode[];
  servesSkills?: true;
  handle: (input: unknown, office: Commands, entry: Entry, actor: Actor) => Promise<unknown>;
};

export const ALL: readonly SessionMode[] = ["work", "review", "triage", "plan", "verify"];

export const define = <S extends z.ZodObject>(tool: Tool<S>): AnyTool => ({
  ...tool,
  handle: (input, office, entry, actor) => tool.run(tool.schema.parse(input), office, entry, actor),
});
