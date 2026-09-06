import type { RepoSource } from "@ho/protocol";
import { parse, str } from "../args.ts";
import { withClient } from "../client.ts";
import { line, print } from "../output.ts";
import { findProject } from "./lookup.ts";
import { subcommand } from "./usage.ts";

const repoFrom = (path: string | undefined, url: string | undefined): RepoSource => {
  if (path !== undefined) {
    return { kind: "local", path };
  }
  if (url !== undefined) {
    return { kind: "git", url };
  }
  throw new Error("--path or --url is required");
};

export async function project(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "project");
  const parsed = parse(rest, ["path", "url", "branch"]);
  await withClient(async (client) => {
    switch (sub) {
      case "list": {
        for (const p of await client.projects.list()) {
          line(
            `${p.id}  ${p.name}  ${p.repo.kind === "local" ? p.repo.path : p.repo.url}  [${p.defaultBranch}]`,
          );
        }
        return;
      }
      case "add": {
        const name = parsed.positionals[0];
        if (name === undefined) {
          throw new Error("project name is required");
        }
        const repo = repoFrom(str(parsed, "path"), str(parsed, "url"));
        const branch = str(parsed, "branch");
        print(
          await client.projects.create({
            name,
            repo,
            ...(branch === undefined ? {} : { defaultBranch: branch }),
          }),
        );
        return;
      }
      case "rm": {
        const ref = parsed.positionals[0];
        if (ref === undefined) {
          throw new Error("project reference is required");
        }
        print(await client.projects.remove({ id: (await findProject(client, ref)).id }));
        return;
      }
      default: {
        throw new Error(`unknown project command "${sub}"`);
      }
    }
  });
}
