export const USAGE = `ho — Home Office command line

  ho daemon                                   run the daemon in the foreground
  ho health
  ho project list
  ho project add <name> (--path <dir> | --url <git-url>) [--branch main]
  ho project rm <project>
  ho agent list
  ho agent add <name> --role boss|worker|reviewer|clerk [--model sonnet] [--effort medium]
               [--gender neutral] [--sprite agent-a] [--project <project>]... [--prompt <text>]
  ho agent rm <agent>
  ho task list [--project <project>] [--status a,b]
  ho task create --project <project> --title <text> [--brief <text>] [--assignee <agent>] [--priority normal]
  ho task show <task-id>
  ho task assign <task-id> <agent|none>
  ho task move <task-id> <status> [--reason <text>]
  ho chat <text> [--project <project>]
  ho tail [--after <seq>]
  ho session list | show <id> | watch [<session-id>|all]
  ho doctor                                   docker, images, secrets, sessions, disk
  ho image build                              build the agent and git-bridge images
  ho secret status | set <key> | rm <key>     keys: anthropic-oauth-token, anthropic-api-key (value via stdin or hidden prompt)
  ho gc                                       remove stopped sandboxes, expired volumes, dangling images
`;

export const subcommand = (
  args: readonly string[],
  group: string,
): { sub: string; rest: string[] } => {
  const [sub, ...rest] = args;
  if (sub === undefined) {
    throw new Error(`missing ${group} subcommand\n\n${USAGE}`);
  }
  return { sub, rest };
};
