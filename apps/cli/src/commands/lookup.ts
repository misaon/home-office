import { type Agent, compact, type Project, type ProjectId } from "@ho/protocol";
import type { HoClient } from "../client.ts";

export const pick = <T extends { id: string; name?: string }>(
  items: readonly T[],
  ref: string,
  kind: string,
): T => {
  const exact = items.filter(
    (item) => item.id === ref || item.name?.toLowerCase() === ref.toLowerCase(),
  );
  if (exact.length === 1 && exact[0] !== undefined) {
    return exact[0];
  }
  if (exact.length > 1) {
    throw new Error(
      `${kind} "${ref}" exists on several floors; use the id (${exact.map((i) => i.id).join(", ")}) or --project`,
    );
  }
  const abbreviated = items.filter((item) => item.id.startsWith(ref) || item.id.endsWith(ref));
  if (abbreviated.length === 1 && abbreviated[0] !== undefined) {
    return abbreviated[0];
  }
  throw new Error(
    abbreviated.length > 1
      ? `${kind} "${ref}" is ambiguous; use its full id`
      : `${kind} "${ref}" not found (use a name, a full id, or a unique id prefix or suffix — lists print the last eight characters)`,
  );
};

export const sortedProjects = async (client: HoClient): Promise<Project[]> => {
  const projects = await client.projects.list();
  return projects.toSorted(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
};

export const findProject = async (client: HoClient, ref: string): Promise<Project> => {
  const projects = await sortedProjects(client);
  const number = /^\d+$/u.test(ref) ? Number(ref) : null;
  const byNumber = number === null ? undefined : projects[number - 1];
  return byNumber ?? pick(projects, ref, "project");
};

export const projectIdOf = async (
  client: HoClient,
  ref: string | undefined,
): Promise<ProjectId | undefined> => {
  if (ref === undefined) {
    return undefined;
  }
  const project = await findProject(client, ref);
  return project.id;
};

export const projectNames = async (client: HoClient): Promise<Map<ProjectId, string>> => {
  const projects = await client.projects.list();
  return new Map(projects.map((p) => [p.id, p.name]));
};

export const findAgent = async (
  client: HoClient,
  ref: string,
  projectId?: ProjectId,
): Promise<Agent> => pick(await client.agents.list(compact({ projectId })), ref, "agent");

const onlyProject = async (client: HoClient): Promise<Project> => {
  const projects = await client.projects.list();
  const [only] = projects;
  if (projects.length === 1 && only !== undefined) {
    return only;
  }
  if (projects.length === 0) {
    throw new Error("no floors yet: add a project with `ho project add --path <dir>`");
  }
  throw new Error(
    `several floors; pick one with --project (${projects.map((p) => p.name).join(", ")})`,
  );
};

export const projectFor = (client: HoClient, ref: string | undefined): Promise<Project> =>
  ref === undefined ? onlyProject(client) : findProject(client, ref);
