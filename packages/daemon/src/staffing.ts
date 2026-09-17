import { staffFloor } from "@ho/core";
import { errorMessage, SYSTEM_ACTOR } from "@ho/protocol";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";

export async function hireDefaultTeams(office: Office, log: Logger): Promise<void> {
  const waiting = [...office.model.projects.values()].filter(
    (project) => project.staffedAt === undefined,
  );
  for (const project of waiting) {
    try {
      const hired = await office.execute(SYSTEM_ACTOR, (model, ctx) =>
        staffFloor(model, project.id, ctx),
      );
      log.info(
        {
          projectId: project.id,
          project: project.name,
          hired: hired.map((agent) => `${agent.name} (${agent.role})`),
        },
        "default team hired",
      );
    } catch (error) {
      log.warn(
        { projectId: project.id, err: errorMessage(error) },
        "default team could not be hired",
      );
    }
  }
}
