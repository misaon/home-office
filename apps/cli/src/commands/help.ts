export const USAGE = `ho — Home Office command line

  ho daemon [--ui]                            run the daemon in the foreground (--ui: print the office URL)
  ho health | doctor                          doctor: docker, images, secrets, sessions, disk
  ho image build                              build the agent and git-bridge images
  ho secret status | set <key> | rm <key>     keys: anthropic-oauth-token, anthropic-api-key, openai-api-key,
                                              gemini-api-key, github-token
                                              (value via stdin or hidden prompt, never argv)
  ho project list                             floors in order (floor 1 is the first project)
  ho project inspect (--path <dir> | --url <git-url>)
                                              what the daemon sees: git repository, name, default branch
  ho project add [name] (--path <dir> | --url <git-url>) [--branch main] [--pr on] [--draft off]
               [--import <agent>]...          a new floor with its boss Andrew (and Lola at the reception);
                                              --import copies characters from other floors
  ho project set <floor> [--branch <name>] [--pr on|off] [--draft on|off]
               [--intake on|off] [--labels a,b] [--interval <seconds>] [--dry-run on|off]
                                              intake: GitHub issues of the project become mail for the boss
  ho project rm <floor>                       removes the floor with its team
  ho agent list [--project <floor>]
  ho agent add <name> --role worker|reviewer|clerk [--project <floor>]
               [--provider claude-code|opencode|gemini-cli|codex] [--auth subscription|api-key|none]
               [--model <id>] [--effort medium] [--gender neutral] [--sprite agent-a]
               [--prompt <text>] [--skills worker|reviewer|none]
                                              (defaults: the only floor, the provider's model/auth, the role's pack)
  ho agent set <agent> [--project <floor>] [--name n] [--provider p] [--auth a] [--model m] [--effort e]
               [--sprite s] [--prompt t] [--skills p]
  ho agent copy <agent> --project <floor> [--from <floor>] [--name <name>]
                                              the same character on another floor
  ho agent rm <agent> [--project <floor>]
  ho task list [--project <project>] [--status a,b]
  ho task create --project <project> --title <text> [--brief <text>] [--assignee <agent>] [--priority normal]
  ho task show <task-id>
  ho task assign <task-id> <agent|none>
  ho task move <task-id> <status> [--reason <text>]
  ho chat <text> [--project <floor>] [--task <task-id>]
                                              to the floor's boss (the only floor when omitted); --task: answer a colleague's question
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
