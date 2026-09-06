import type { Agent, Project } from "@ho/protocol";
import type { HoClient } from "../client.ts";

const pick = <T extends { id: string; name: string }>(
  items: readonly T[],
  ref: string,
  kind: string,
): T => {
  const exact = items.find(
    (item) => item.id === ref || item.name.toLowerCase() === ref.toLowerCase(),
  );
  if (exact !== undefined) {
    return exact;
  }
  const prefixed = items.filter((item) => item.id.startsWith(ref));
  if (prefixed.length === 1 && prefixed[0] !== undefined) {
    return prefixed[0];
  }
  throw new Error(`${kind} "${ref}" not found (use a name, a full id or a unique id prefix)`);
};

export const findProject = async (client: HoClient, ref: string): Promise<Project> =>
  pick(await client.projects.list(), ref, "project");
export const findAgent = async (client: HoClient, ref: string): Promise<Agent> =>
  pick(await client.agents.list(), ref, "agent");
