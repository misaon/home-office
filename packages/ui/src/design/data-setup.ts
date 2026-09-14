/**
 * What the office asks for before it can work: the keys it stores and the four first-run steps.
 * Fixtures, like everything else the design was drawn against — see [[data]].
 */

export type Cred = { name: string; status: "stored" | "missing"; value: string; desc: string };
export type Step = {
  n: string;
  title: string;
  status: "checking" | "ready" | "stored" | "working" | "to do";
  desc: string;
  btn: string;
};

export const CREDS: Cred[] = [
  {
    name: "Claude subscription token",
    status: "stored",
    value: "",
    desc: "Run claude setup-token in a terminal and paste the result. Stored in the configured secret store.",
  },
  {
    name: "Anthropic API key",
    status: "missing",
    value: "",
    desc: "For Claude Code agents set to api-key auth, and for OpenCode with anthropic/… models.",
  },
  {
    name: "OpenAI API key",
    status: "missing",
    value: "",
    desc: "Codex agents and OpenCode with openai/… models.",
  },
  {
    name: "GitHub token",
    status: "missing",
    value: "",
    desc: "Reserved for future use. Intake and pull requests currently use your host gh login.",
  },
];

export const STEPS: Step[] = [
  {
    n: "1",
    title: "Docker",
    status: "checking",
    desc: "Agents run in isolated Alpine containers. Install and start Docker Desktop (or another Docker engine), then check again.",
    btn: "Check again",
  },
  {
    n: "2",
    title: "Agent images",
    status: "ready",
    desc: "The agent image bundles Claude Code, git, headless Chromium and the browser MCP servers. The first build downloads everything; later builds reuse cached layers.",
    btn: "Rebuild images",
  },
  {
    n: "3",
    title: "Claude subscription token",
    status: "stored",
    desc: "Agents sign in with your Claude subscription. The token is kept in this machine’s credential store and only ever handed to the claude process inside a sandbox.",
    btn: "Replace token",
  },
  {
    n: "4",
    title: "Smoke test",
    status: "to do",
    desc: "Sends a hello to the boss of the selected floor: the first sandbox starts, Claude Code signs in with your token and the reply lands in Chat. Expect 20–60 seconds.",
    btn: "Say hello",
  },
];
