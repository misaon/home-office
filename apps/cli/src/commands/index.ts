import type { Command } from "../cli.ts";
import { agentCommand } from "./agent.ts";
import { chatCommand } from "./chat.ts";
import { intakeCommand, mailCommand } from "./intake.ts";
import { projectCommand } from "./project.ts";
import { secretCommand } from "./secret.ts";
import { sessionCommand } from "./session.ts";
import { tailCommand, usageCommand } from "./streams.ts";
import {
  daemonCommand,
  doctorCommand,
  gcCommand,
  healthCommand,
  imageCommand,
  resourcesCommand,
  uiCommand,
} from "./system.ts";
import { taskCommand } from "./task.ts";

/** Every command, in the order `ho help` lists them; the help text is generated from this table. */
export const COMMANDS: readonly Command[] = [
  daemonCommand,
  healthCommand,
  doctorCommand,
  imageCommand,
  secretCommand,
  projectCommand,
  agentCommand,
  taskCommand,
  chatCommand,
  sessionCommand,
  intakeCommand,
  mailCommand,
  usageCommand,
  resourcesCommand,
  uiCommand,
  gcCommand,
  tailCommand,
];
