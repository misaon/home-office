import { bossOf, postAgentMessage } from "@ho/core";
import {
  environmentDescribed,
  errorMessage,
  type Mandate,
  type MandateId,
  type Project,
  SYSTEM_ACTOR,
} from "@ho/protocol";
import { suggestedConfig, suggestEnvironment } from "./environment-suggest.ts";
import type { StewardDeps } from "./mandate-actions.ts";
import { sourcePathFor } from "./mirrors.ts";
import { voiceFor } from "./voice.ts";

const floorUnconfigured = (project: Project): boolean =>
  !environmentDescribed(project.environment) && project.verify.command === "";

const noticed = new Set<MandateId>();

async function post(deps: StewardDeps, mandate: Mandate, project: Project): Promise<void> {
  const { office, home, log } = deps;
  const boss = bossOf(office.model, project.id);
  if (boss === undefined || mandate.round > 0) {
    return;
  }
  const suggestions = await suggestEnvironment(
    await sourcePathFor(home, project),
    project.defaultBranch,
  ).catch((): [] => []);
  const text = voiceFor(project.language).unconfiguredFloor(
    suggestions.length === 0 ? null : suggestedConfig(suggestions),
  );
  log.info(
    { mandateId: mandate.id, projectId: project.id, suggestions: suggestions.length },
    "the floor has no environment and no check command",
  );
  await office
    .traced({ correlationId: mandate.id })
    .execute(SYSTEM_ACTOR, (m, c) => postAgentMessage(m, boss.id, text, mandate.rootTaskId, c));
}

export async function noticeUnconfiguredFloor(
  deps: StewardDeps,
  mandate: Mandate,
  project: Project,
): Promise<void> {
  if (noticed.has(mandate.id) || !floorUnconfigured(project)) {
    return;
  }
  noticed.add(mandate.id);
  await post(deps, mandate, project).catch((error: unknown) => {
    deps.log.warn(
      { mandateId: mandate.id, err: errorMessage(error) },
      "the unconfigured-floor notice could not be posted",
    );
  });
}
