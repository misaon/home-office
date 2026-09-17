import type {
  Actor,
  AgentId,
  HoReportInput,
  ProjectId,
  ProviderId,
  SessionId,
  SessionMode,
  TaskId,
} from "@ho/protocol";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";
import type { AttachmentStore } from "./attachments.ts";
import type { Office } from "./office.ts";
import type { SkillLibrary } from "./skills.ts";

export type McpSessionContext = {
  sessionId: SessionId;
  skillPack: string;
  taskId: TaskId;
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
  report: HoReportInput | null;
  skills: SkillLibrary;
};
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: true };
export type Tool<S extends z.ZodRawShape> = {
  name: string;
  description: string;
  shape: S;
  modes: readonly SessionMode[];
  servesSkills?: true;
  run: (
    input: z.infer<z.ZodObject<S>>,
    office: Office,
    entry: Entry,
    actor: Actor,
  ) => Promise<unknown>;
};
export type AnyTool = {
  name: string;
  description: string;
  shape: ZodRawShapeCompat;
  modes: readonly SessionMode[];
  servesSkills?: true;
  handle: (input: unknown, office: Office, entry: Entry, actor: Actor) => Promise<unknown>;
};

export const ALL: readonly SessionMode[] = ["work", "review", "triage"];

export const define = <S extends z.ZodRawShape>(tool: Tool<S>): AnyTool => {
  const schema = z.object(tool.shape);
  return {
    ...tool,
    handle: (input, office, entry, actor) => tool.run(schema.parse(input), office, entry, actor),
  };
};
