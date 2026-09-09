import type { Command } from "../command.ts";
import { agentCommand } from "./agent.ts";
import { chatCommand } from "./chat.ts";
import { daemonCommand } from "./daemon.ts";
import { doctorCommand } from "./doctor.ts";
import { gcCommand } from "./gc.ts";
import { healthCommand } from "./health.ts";
import { imageCommand } from "./image.ts";
import { intakeCommand, mailCommand } from "./intake.ts";
import { projectCommand } from "./project.ts";
import { resourcesCommand } from "./resources.ts";
import { secretCommand } from "./secret.ts";
import { sessionCommand } from "./session.ts";
import { tailCommand } from "./tail.ts";
import { taskCommand } from "./task.ts";
import { uiCommand } from "./ui.ts";
import { usageCommand } from "./usage.ts";

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
