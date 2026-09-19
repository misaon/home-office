import type { Command } from "../cli.ts";
import { agentCommand } from "./agent.ts";
import { chatCommand } from "./chat.ts";
import { evalCommand } from "./evals.ts";
import { intakeCommand, mailCommand } from "./intake.ts";
import { projectCommand } from "./project.ts";
import { remoteCommand } from "./remote.ts";
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
  evalCommand,
  resourcesCommand,
  uiCommand,
  gcCommand,
  tailCommand,
  remoteCommand,
];
