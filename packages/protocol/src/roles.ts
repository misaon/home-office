import { z } from "zod";

export const AgentRole = z.enum([
  "boss",
  "secretary",
  "analyst",
  "backend",
  "frontend",
  "devops",
  "qa",
  "security",
  "head",
  "developer",
]);
export type AgentRole = z.infer<typeof AgentRole>;

export const StaffRole = AgentRole.exclude(["boss"]);
export type StaffRole = z.infer<typeof StaffRole>;

export const ROLE_TITLE: Readonly<Record<AgentRole, string>> = {
  boss: "boss",
  secretary: "secretary",
  analyst: "analyst",
  backend: "backend developer",
  frontend: "frontend developer",
  devops: "DevOps engineer",
  qa: "QA engineer",
  security: "security engineer",
  head: "head of development",
  developer: "developer",
};

export const ReviewStage = z.enum(["qa", "security", "head"]);
export type ReviewStage = z.infer<typeof ReviewStage>;

export const REVIEW_STAGES = ReviewStage.options satisfies readonly AgentRole[];

export const ReviewPlan = z.object({
  qa: z.boolean().default(false),
  security: z.boolean().default(false),
  head: z.boolean().default(true),
});
export type ReviewPlan = z.infer<typeof ReviewPlan>;

export const TaskKind = z.enum(["work", "triage", "plan"]);
export type TaskKind = z.infer<typeof TaskKind>;

export const SessionMode = z.enum(["work", "review", "triage", "plan"]);
export type SessionMode = z.infer<typeof SessionMode>;

export const MODE_OF_KIND: Readonly<Record<TaskKind, SessionMode>> = {
  work: "work",
  triage: "triage",
  plan: "plan",
};
