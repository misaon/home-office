import { withClient } from "../client.ts";
import { line, print } from "../output.ts";
import { agent } from "./agent.ts";
import { chat } from "./chat.ts";
import { daemon } from "./daemon.ts";
import { doctor } from "./doctor.ts";
import { gc } from "./gc.ts";
import { image } from "./image.ts";
import { session } from "./session.ts";
import { project } from "./project.ts";
import { secret } from "./secret.ts";
import { tail } from "./tail.ts";
import { resources } from "./resources.ts";
import { task } from "./task.ts";
import { usage } from "./usage.ts";
import { ui } from "./ui.ts";
import { USAGE } from "./help.ts";

export async function run(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  switch (command) {
    case "daemon": {
      await daemon();
      return;
    }
    case "health": {
      await withClient(async (client) => {
        print(await client.system.health());
      });
      return;
    }
    case "project": {
      await project(rest);
      return;
    }
    case "agent": {
      await agent(rest);
      return;
    }
    case "task": {
      await task(rest);
      return;
    }
    case "chat": {
      await chat(rest);
      return;
    }
    case "tail": {
      await tail(rest);
      return;
    }
    case "session": {
      await session(rest);
      return;
    }
    case "doctor": {
      await doctor();
      return;
    }
    case "image": {
      await image(rest);
      return;
    }
    case "secret": {
      await secret(rest);
      return;
    }
    case "gc": {
      await gc();
      return;
    }
    case "usage": {
      await usage(rest);
      return;
    }
    case "ui": {
      await ui(rest);
      return;
    }
    case "resources": {
      await resources();
      return;
    }
    case undefined:
    case "help":
    case "--help":
    case "-h": {
      line(USAGE);
      return;
    }
    default: {
      throw new Error(`unknown command "${command}"\n\n${USAGE}`);
    }
  }
}
