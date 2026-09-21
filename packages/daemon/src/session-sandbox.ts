import type { SandboxSpec } from "@ho/core";
import { type Agent, CHAT_INBOX_DIR, CHAT_OUTBOX_DIR, imageRefFor, PROVIDERS } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { type GitIdentity, REPO_IN_VOLUME } from "./git-bridge.ts";
import { LABELS } from "./labels.ts";
import type { SessionContext } from "./session-provision.ts";
import { engineEnv, type TaskEnginePlan } from "./task-engine.ts";

const gitIdentity = (
  agent: Agent,
  committer: GitIdentity | null,
): Readonly<Record<string, string>> => {
  const slug = agent.name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  const address = `${slug === "" ? agent.id : slug}@agents.home-office.local`;
  return {
    GIT_AUTHOR_NAME: agent.name,
    GIT_AUTHOR_EMAIL: address,
    GIT_COMMITTER_NAME: committer?.name ?? agent.name,
    GIT_COMMITTER_EMAIL: committer?.email ?? address,
  };
};

export const sandboxSpec = (
  config: DaemonConfig,
  ctx: SessionContext,
  volume: string,
  stateVolume: string,
  gatewayUrl: string,
  token: string,
  engine: TaskEnginePlan | null,
  chat: { outbox: string; inbox: string },
  committer: GitIdentity | null,
): SandboxSpec => ({
  name: `ho-session-${ctx.session.id.slice(-12)}`,
  ports: ctx.project.preview.enabled ? [ctx.project.preview.port] : [],
  image: imageRefFor(config.docker.agentImage, PROVIDERS[ctx.agent.provider].image),
  cmd: ["bun", "/usr/local/bin/ho-runner.js"],
  env: {
    HO_GATEWAY: gatewayUrl,
    HO_SESSION_TOKEN: token,
    HOME: "/home/agent",
    TERM: "dumb",
    ...gitIdentity(ctx.agent, committer),
    ...(engine === null ? {} : engineEnv(engine.mode)),
  },
  user: "1000:1000",
  workdir: REPO_IN_VOLUME,
  labels: {
    [LABELS.managed]: "true",
    [LABELS.kind]: "session",
    [LABELS.session]: ctx.session.id,
    [LABELS.task]: ctx.task.id,
    [LABELS.project]: ctx.project.id,
  },
  network: config.docker.network,
  volumes: [
    { name: volume, target: "/work" },
    { name: stateVolume, target: PROVIDERS[ctx.agent.provider].stateDir },
    ...(engine === null ? [] : [{ name: engine.socketVolume, target: engine.socketDir }]),
  ],
  binds: [
    { source: chat.inbox, target: CHAT_INBOX_DIR, readonly: true },
    { source: chat.outbox, target: CHAT_OUTBOX_DIR, readonly: false },
  ],
  tmpfs: {
    "/tmp": "rw,nosuid,size=256m",
    ...Object.fromEntries(
      PROVIDERS[ctx.agent.provider].scratchDirs.map((dir) => [
        dir,
        "rw,nosuid,size=128m,uid=1000,gid=1000,mode=0755",
      ]),
    ),
  },
  limits: {
    memoryBytes: config.limits.memoryMb * 1024 * 1024,
    cpus: config.limits.cpus,
    pids: config.limits.pids,
  },
  readonlyRootfs: true,
});
