export const USAGE = `ho — Home Office command line

  ho daemon [--ui]                            run the daemon in the foreground (--ui: print the office URL)
  ho health | doctor                          doctor: docker, images, secrets, sessions, disk
  ho image build                              build the agent and git-bridge images
  ho secret status | set <key> | rm <key>     keys: anthropic-oauth-token, anthropic-api-key, github-token
                                              (value via stdin or hidden prompt, never argv)
  ho project list
  ho project add <name> (--path <dir> | --url <git-url>) [--branch main] [--pr on] [--draft off]
  ho project set <project> [--branch <name>] [--pr on|off] [--draft on|off]
               [--intake on|off] [--labels a,b] [--interval <seconds>] [--dry-run on|off]
                                              intake: GitHub issues of the project become mail for the boss
  ho project rm <project>
  ho agent list
  ho agent add <name> --role boss|worker|reviewer|clerk [--model sonnet] [--effort medium]
               [--gender neutral] [--sprite agent-a] [--project <project>]... [--prompt <text>]
               [--skills worker|reviewer|boss|none]   (default: the role's pack)
  ho agent set <agent> [--model m] [--effort e] [--sprite s] [--prompt t] [--skills p]
               [--project <project>]...      (--project replaces the whole membership list)
  ho agent rm <agent>
  ho task list [--project <project>] [--status a,b]
  ho task create --project <project> --title <text> [--brief <text>] [--assignee <agent>] [--priority normal]
  ho task show <task-id>
  ho task assign <task-id> <agent|none>
  ho task move <task-id> <status> [--reason <text>]
  ho chat <text> [--project <project>] [--task <task-id>]
                                              no flags: the boss triages it; --project: inbox task; --task: answer an agent's question
  ho session list | show <id> | watch [<session-id>|all]
  ho intake poll [--project <project>] | status
                                              poll GitHub issues now / show intake health per project
  ho mail list [--project <project>]          issues the postman brought in and their acknowledgements
  ho usage [--since 24h|7d]                   tokens per agent, project and day
  ho resources                                containers and volumes HO owns, with sizes
  ho ui [--print]                             open the office UI in the browser (or print its URL)
  ho gc                                       remove stopped sandboxes, expired volumes, dangling images
  ho tail [--after <seq>]                     stored domain events (replay, then live)
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
