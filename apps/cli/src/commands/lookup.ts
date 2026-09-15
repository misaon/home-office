import { type Agent, compact, type Project, type ProjectId } from "@ho/protocol";
import type { HoClient } from "../client.ts";

/** By exact id or name, else by a unique id prefix or suffix (lists print the last eight characters). */
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

/** Floors in creation order: the first project is floor 1. */
export const sortedProjects = async (client: HoClient): Promise<Project[]> => {
  const projects = await client.projects.list();
  return projects.toSorted(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
};

/** A floor by name, id, id prefix or floor number (1 is the first project). */
export const findProject = async (client: HoClient, ref: string): Promise<Project> => {
  const projects = await sortedProjects(client);
  const number = /^\d+$/u.test(ref) ? Number(ref) : null;
  const byNumber = number === null ? undefined : projects[number - 1];
  return byNumber ?? pick(projects, ref, "project");
};

/** The id behind an optional `--project`; undefined when the flag was not given. */
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

/** Floor names by id, for lists that show where something lives. */
export const projectNames = async (client: HoClient): Promise<Map<ProjectId, string>> => {
  const projects = await client.projects.list();
  return new Map(projects.map((p) => [p.id, p.name]));
};

/** An agent by name or id, on one floor when given (names repeat across floors: every floor has an Andrew). */
export const findAgent = async (
  client: HoClient,
  ref: string,
  projectId?: ProjectId,
): Promise<Agent> => pick(await client.agents.list(compact({ projectId })), ref, "agent");

/** The floor a command means when `--project` is omitted: the only one there is, otherwise an error. */
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

/** `--project` when given, else the only floor. */
export const projectFor = (client: HoClient, ref: string | undefined): Promise<Project> =>
  ref === undefined ? onlyProject(client) : findProject(client, ref);
