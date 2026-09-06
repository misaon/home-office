# Home Office — Architecture

Home Office (HO) is a local multi-agent harness: a Bun daemon orchestrates AI coding agents that run inside isolated Docker containers, and a desktop app renders the team as a pixel-art office (LimeZu _Modern Office_ style, 16×16 tiles). The office is a **projection of the event stream**; nothing in the simulation is authoritative.

Decisions taken with the owner on 2026-09-06: Electrobun desktop shell · Docker Engine API directly (no Swarm services) · **one floor per project** with an elevator · isolated clone per task with results pushed as branches. See `docs/PLAN.md` § Decisions.

## 1. Principles

1. **Ports and adapters.** Pure core (`@ho/core`, `@ho/sim`) with interfaces; adapters for Docker, Claude Code, ACP agents, GitHub, SQLite, secrets.
2. **Event-sourced.** Every state change is an event appended to SQLite. Projections (tasks board, agent status, usage, office scene) are derived and rebuildable.
3. **One daemon, three faces.** The same `@ho/daemon` library runs inside the Electrobun main process (desktop), as `ho daemon` (CLI/server), and is driven by the `ho` CLI over the same oRPC contract.
4. **Agnostic by interface.** `AgentRuntime` (which brain), `SandboxProvider` (where it runs), `IntakeConnector` (where work comes from), `SecretStore` (where credentials live). Each has exactly one implementation in the early phases, but nothing outside the adapter package knows which.
5. **Token and hardware frugality are features**, not afterthoughts (see § 11–13).
6. **Security by construction**: agents never see host files or credentials; the daemon never executes agent text.

## 2. Process topology

```
┌────────────────────────── macOS host ──────────────────────────────┐
│  Electrobun launcher (native)                                       │
│   └─ Bun main process  ── runs @ho/daemon in-process                │
│        ├─ oRPC over WebSocket  127.0.0.1:<port>  (bearer token)     │
│        ├─ HO MCP server (streamable HTTP) for agents                │
│        ├─ Runner gateway (WebSocket) for ho-runner in containers    │
│        ├─ SQLite (bun:sqlite, WAL)  ~/.config/home-office/ho.db     │
│        └─ Docker Engine API  fetch({ unix: "/var/run/docker.sock" })│
│   └─ WKWebView  ← loads static @ho/ui bundle (React + PixiJS)       │
│                    connects to oRPC WS with the launch token         │
│                                                                     │
│  CLI mode:  `ho daemon` (same library) + `ho …` commands (oRPC)     │
│             browser UI served at http://127.0.0.1:<port>            │
└─────────────────────────────────────────────────────────────────────┘
          │ Docker Engine API                     ▲ WS (outbound from container)
          ▼                                       │
┌─ Docker Desktop VM ───────────────────────────────────────────────┐
│  network ho-agents (bridge, ICC off)                               │
│  ┌ agent session container (alpine, non-root, ro rootfs) ───────┐ │
│  │  ho-runner ──spawns──▶ claude -p --input-format stream-json … │ │
│  │      ▲ relays stdin/stdout JSONL over WS to the daemon        │ │
│  │  /work  (task volume, git clone of the project)                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  git-bridge (short-lived helper): clone host repo → task volume,  │
│              push result branch task volume → host repo            │
│  cache volumes per project (bun/npm caches), TTL-pruned            │
└───────────────────────────────────────────────────────────────────┘
```

Why the runner connects **outbound**: Docker `attach`/`exec` streaming requires HTTP hijacking (raw socket after upgrade), which `fetch` cannot do. A tiny compiled Bun binary inside the container that dials the daemon's WebSocket gives us bidirectional JSONL relay, authenticated with a one-time session token, and the OAuth token is delivered over that channel and only ever exists in the `claude` process environment. The same pattern works unchanged for a cloud provider.

## 3. Monorepo layout

```
home-office/
├─ AGENTS.md                 # canonical agent instructions; CLAUDE.md imports it (@AGENTS.md)
├─ package.json              # workspaces + catalog (single source of dependency versions)
├─ bunfig.toml               # linker = "isolated", exact = true
├─ tsconfig.base.json / tsconfig.json (references)
├─ .oxlintrc.json  .oxfmtrc.json  knip.json
├─ apps/
│  ├─ desktop/               # Electrobun app: electrobun.config.ts, src/main.ts (starts daemon), native RPC only
│  └─ cli/                   # `ho` binary: daemon, project, agent, task, session, usage, doctor
├─ packages/
│  ├─ protocol/              # Zod schemas, branded IDs, domain events, oRPC contract, MCP tool schemas (shared by all)
│  ├─ core/                  # pure domain: task state machine, scheduler, budgets, handoff rules, ports (interfaces)
│  ├─ store/                 # EventStore + projections on bun:sqlite + Drizzle; migrations
│  ├─ daemon/                # composition root: oRPC WS server, static UI serving, runner gateway, HO MCP server, GC jobs, config
│  ├─ sandbox-docker/        # SandboxProvider for Docker Engine API (containers, volumes, networks, exec, stats, prune)
│  ├─ runtime-claude-code/   # AgentRuntime for Claude Code headless (stream-json codec, session resume, usage, errors)
│  ├─ runtime-acp/           # (Phase 7) generic ACP client runtime: Gemini CLI, OpenCode, Codex
│  ├─ intake-github/         # (Phase 6) IntakeConnector polling GitHub Issues through `gh`
│  ├─ secrets/               # SecretStore: macOS Keychain (`security`), 0600 file fallback
│  ├─ sim/                   # pure office simulation: floors, grid, A*, elevator, behaviours, emotions, event→intent
│  ├─ ui/                    # React 19 + PixiJS 8 webview: office canvas, chat, board, floors, inspector, usage, settings
│  └─ agent-kit/             # role plugins (curated ECC skills), hooks (RTK), settings templates → baked into the image
├─ images/
│  ├─ agent/                 # Dockerfile (alpine), build script, ho-runner build
│  └─ git-bridge/            # Dockerfile (alpine + git)
├─ assets/                   # sprites (source PNGs) + packing script → spritesheet JSON for PixiJS
├─ spikes/                   # throwaway experiments (deleted or promoted)
├─ docs/                     # PLAN, ARCHITECTURE, STACK, CONVENTIONS, ADRs later
└─ .github/workflows/        # ci.yml (checks), release.yml (macos-26 → GitHub Releases)
```

Package names use the `@ho/*` scope. Only `apps/*` may depend on `@ho/daemon`; adapters depend on `@ho/core` and `@ho/protocol`, never on each other.

## 4. Domain model

| Entity              | Key fields                                                                                                                                                                                                                                                       | Notes                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Project**         | `id`, `name`, `repo: { kind: "local", path } \| { kind: "git", url }`, `defaultBranch`, `floorTemplateId`, `settings` (caches, budgets)                                                                                                                          | One floor per project.                                                                                                                                                                                 |
| **Agent** (persona) | `id`, `name`, `role` (`boss` \| `worker` \| `reviewer` \| `clerk`…), `appearance` (sprite set, gender), `provider` (`claude-code` \| `acp:<agent>`), `model`, `effort`, `basePrompt`, `skillPack`, `budgets` (max turns/task, concurrent sessions), `projects[]` | Exactly one `boss`. Personas are config; compute is per session.                                                                                                                                       |
| **Task**            | `id`, `projectId`, `parentId?`, `title`, `brief`, `status`, `assigneeId?`, `source` (`chat` \| `mail:<connector>` \| `delegation`), `artifacts` (branch, PR URL, report), `priority`, timestamps                                                                 | Status machine: `inbox → planned → assigned → in_progress → review → done` with side exits `blocked`, `failed`, `cancelled`.                                                                           |
| **Session**         | `id`, `taskId`, `agentId`, `sandboxId`, `runtimeSessionId` (Claude session UUID), `state`, `usage` (input/output/cache tokens, turns, wall time), `containerId`, `volumeId`                                                                                      | A session is one container lifetime working on one task.                                                                                                                                               |
| **Handoff**         | `id`, `taskId`, `fromAgentId`, `toAgentId`, `brief`, `state`                                                                                                                                                                                                     | Drives the "walk over and hand the folder" animation.                                                                                                                                                  |
| **MailItem**        | `id`, `connector`, `externalId`, `payload`, `state`                                                                                                                                                                                                              | Postman/mailbox pipeline (Phase 6).                                                                                                                                                                    |
| **ChatMessage**     | `id`, `author` (`human` \| agentId), `text`, `taskId?`                                                                                                                                                                                                           | Right-hand chat with the boss.                                                                                                                                                                         |
| **Event**           | `id` (UUIDv7), `type`, `payload`, `at` (ISO-8601), `correlationId`, `causationId`, `actor`                                                                                                                                                                       | Append-only. Types are a Zod discriminated union in `@ho/protocol` (e.g. `task.created`, `task.assigned`, `session.started`, `agent.tool_call`, `handoff.started`, `usage.recorded`, `mail.received`). |

Office-only state (positions, current behaviour, emotion) is **not** persisted; it is derived in `@ho/sim` from events plus a seeded RNG, so a restart re-derives a plausible scene.

## 5. Ports (interfaces in `@ho/core`)

```ts
// Where agents run
interface SandboxProvider {
  readonly id: "docker" | "gcp" | (string & {});
  ensureImage(spec: ImageSpec, onProgress?: (p: BuildProgress) => void): Promise<ImageRef>;
  createVolume(spec: VolumeSpec): Promise<VolumeRef>;
  create(spec: SandboxSpec): Promise<SandboxHandle>; // image, volumes, limits, network, labels, env (non-secret), user
  start(h: SandboxHandle): Promise<void>;
  exec(h: SandboxHandle, cmd: readonly string[], opts?: ExecOpts): Promise<ExecResult>; // detached or short-lived only
  stop(h: SandboxHandle, graceSeconds?: number): Promise<void>;
  remove(h: SandboxHandle): Promise<void>;
  removeVolume(v: VolumeRef): Promise<void>;
  stats(h: SandboxHandle): Promise<ResourceStats>;
  prune(policy: PrunePolicy): Promise<PruneReport>; // by label + age; images/volumes/containers
  health(): Promise<ProviderHealth>; // API version, disk usage, reachable
}

// Which brain
interface AgentRuntime {
  readonly id: "claude-code" | "acp" | (string & {});
  capabilities(): RuntimeCapabilities; // resume, images, structuredOutput, effortLevels, models
  open(spec: RuntimeSessionSpec, channel: RunnerChannel): Promise<RuntimeSession>;
}
interface RuntimeSession {
  prompt(input: PromptInput, signal: AbortSignal): AsyncIterable<RuntimeEvent>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  readonly resumeToken: string | null; // Claude session id for --resume
}
// Normalised events every runtime must emit
type RuntimeEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "tool_call"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; id: string; ok: boolean; summary: string }
  | { kind: "permission_request"; id: string; tool: string; input: unknown }
  | { kind: "usage"; input: number; output: number; cacheRead: number; cacheWrite: number }
  | { kind: "rate_limited"; retryAt: Date | null }
  | { kind: "result"; ok: boolean; text: string; structured?: unknown; turns: number }
  | { kind: "error"; code: RuntimeErrorCode; message: string };

// Where work comes from
interface IntakeConnector {
  readonly id: "github-issues" | "jira" | (string & {});
  poll(since: Cursor, signal: AbortSignal): Promise<{ items: MailItem[]; next: Cursor }>;
  acknowledge(item: MailItem, outcome: IntakeOutcome): Promise<void>; // comment/label back
}

interface SecretStore {
  get(key: SecretKey): Promise<string | null>;
  set(key: SecretKey, v: string): Promise<void>;
  delete(key: SecretKey): Promise<void>;
}
interface EventStore {
  append(events: NewEvent[]): Promise<Event[]>;
  read(from: EventId | null, filter?: EventFilter): AsyncIterable<Event>;
  subscribe(filter?: EventFilter): AsyncIterable<Event>;
}
interface Clock {
  now(): Date;
  after(ms: number, signal?: AbortSignal): Promise<void>;
}
```

## 6. Claude Code runtime adapter

Container command (assembled by `@ho/runtime-claude-code`, executed by `ho-runner`):

```
claude -p \
  --input-format stream-json --output-format stream-json --verbose --include-partial-messages \
  --session-id <uuid>            # or --resume <uuid> for follow-up turns (keeps the 1 h prompt cache warm)
  --model <alias|id> --effort <low|medium|high|xhigh|max> \
  --permission-mode bypassPermissions --permission-prompts none \   # non-root user inside the sandbox
  --max-turns <budget> \
  --setting-sources user --settings /etc/ho/claude-settings.json \  # our settings only; project settings ignored
  --strict-mcp-config --mcp-config /etc/ho/mcp.json \                # only the HO MCP server
  --plugin-dir /opt/ho/plugins/<role> \                              # curated skills for this role
  --append-system-prompt-file /run/ho/role.md \                      # persona + task protocol (short)
  --name "<agent>/<task>"
```

Environment inside the container: `CLAUDE_CODE_OAUTH_TOKEN` (injected by the runner, from the daemon over WS), `CLAUDE_CONFIG_DIR=/home/agent/.claude` (tmpfs), `USE_BUILTIN_RIPGREP=0`, `DISABLE_AUTOUPDATER=1`, `DISABLE_TELEMETRY=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `ENABLE_CLAUDEAI_MCP_SERVERS=false`, `HO_SESSION_TOKEN` (one-time, for the runner only), `HO_MCP_URL`. `--bare` is **not** used because it does not read the OAuth token.

stdin messages: `{"type":"user","message":{"role":"user","content":"…"},"parent_tool_use_id":null}`; stdout events: `system/init`, `assistant`, `user`, `stream_event`, `system/api_retry` (with `error: "rate_limit" | …`), `result` (usage, `session_id`, `permission_denials`). The codec in the adapter is a Zod-validated tagged union; unknown event types are logged at `debug` and ignored.

Session strategy: one Claude session per (agent, task). Follow-ups (`review feedback`, `boss question`) resume the same session while the container is alive; if the container was reclaimed, a new container resumes by `--resume` only if the Claude config volume was kept (configurable `sessionRetention`), otherwise the task brief carries a compact summary.

Sandbox extras: Claude settings travel inline (`--settings '<json>'`) and include the **RTK** `PreToolUse` hook (`rtk hook claude`) that rewrites Bash commands to compact equivalents; role skill packs from `@ho/agent-kit` are baked into `/opt/ho/plugins/<pack>` and loaded with `--plugin-dir` according to `agent.skillPack` (`worker`, `reviewer`, `boss`, or `none`). The `system/init` line becomes an `init` runtime event (model, tools, plugins, MCP servers) so the UI and `ho session watch` can show what a session loaded.

## 7. Orchestration and the collaboration protocol

- **The office project.** The daemon creates one project with `repo.kind = "none"` (name "Office", floor template `lobby`). It is the Lobby: triage tasks live there and its sessions have no repository.
- **Boss loop (triage).** A human chat message without `projectId` or `taskId` becomes a `triage` task in the office project assigned to the boss; the scheduler starts a `triage` session whose prompt carries the roster (names, roles, skill packs, memberships, load) and the projects. The boss must act through tools: `ho_delegate` (one task per independent piece of work, assigned to a project member or left in the inbox), `ho_reply` (talk to the human), `ho_list_agents`, `ho_list_projects`, then `ho_report(done)`. The final text of a triage session is posted to chat when the boss did not already reply.
- **Worker loop (work).** The session prompt names the branch and the protocol; the worker commits and calls `ho_report` (`review`, `done` or `blocked`, summary ≤ 1,500 chars). A report on a project with a reviewer member automatically assigns that reviewer and moves the task to `review`. When the agent ends without reporting, the daemon files the result text on its behalf. Branch push and delivery happen at this point (§ 8).
- **Review loop.** The scheduler starts a `review` session for the task's reviewer (prompt: diff against the default branch, no edits) who calls `ho_review`: `approve` → `done`; `request_changes` → findings become a task note, `reviewRounds` increments, the task returns to `assigned` for the author (or `blocked` once the author's `maxReviewRounds` is exceeded). A review that ends without a verdict blocks the task for the human.
- **Handoff.** `ho_handoff(toAgent, brief)` records `handoff.requested` (the office animation's trigger), adds a `handoff` note, reassigns and re-queues the task; the current session ends. Only project members (or the boss) can receive a task.
- **Questions.** `ho_ask_human(question)` posts the question to chat, notes it and blocks the task. The human answers with `chat.send({ taskId })` (`ho chat --task <id> "..."`); the task returns to `assigned` and the same agent's session **resumes**.
- **Resume.** Every session of the same agent on the same task reuses the task volume (repository state) and a per-agent Claude config volume, and passes the previous Claude session id with `--resume`, so context survives review rounds, handoffs back and human answers. The opening message lists the notes added since the previous session; a resume whose conversation is gone falls back to a fresh conversation once.
- **Budgets.** Per task: `maxTurnsPerTask`, `maxWallMinutes` (aborts the session), `maxReviewRounds`. Per agent: `maxConcurrentSessions`. Global: `scheduler.maxConcurrentSessions` (default 2) protects the subscription's rolling 5-hour window; `rate_limited` marks the session idle.
- **HO MCP server.** Streamable HTTP (`@modelcontextprotocol/sdk`, stateless JSON responses) on the daemon at `/mcp`, reachable from sandboxes via `host.docker.internal`. Every session gets its own bearer token; each request builds a small `McpServer` bound to that session, exposing only the tools its mode allows, so a tool call can never touch another task. Inputs are Zod schemas from `@ho/protocol`; every call becomes domain events.

## 8. Repository flow (git-bridge, mirrors, delivery)

1. **Source path.** A `local` project is its host checkout. A `git` project is mirrored on the host at `$HO_HOME/mirrors/<projectId>.git` with the owner's own git credentials (`git clone --mirror`, refreshed with `git fetch --prune` before every session). Sandboxes and bridges only ever see host paths; no remote credential enters a container.
2. **Clone.** `session.starting` → create the labelled task volume (`ho.kind=task-volume`) and Claude config volume (`ho.kind=claude-config`) → run `git-bridge` with the source mounted **read-only** at `/src`: `git clone --branch <default> --single-branch /src /work/repo && git checkout -b ho/<task-slug>-<shortid>`.
3. **Work.** The agent works in `/work/repo` only. Caches mount from per-project cache volumes (Phase 8).
4. **Push.** On success the bridge runs exactly `git -C /work/repo push -f /src HEAD:refs/heads/ho/<branch>` with the source mounted **read-write**; the agent container never has that mount. For `git` projects the daemon then pushes the branch from the mirror to the real remote (`git push origin`) with host credentials.
5. **Deliver.** Per project `publish` policy: `branch` (default) stops here; `pull-request` also runs the host's `gh pr create --head <branch> --base <default> [--draft]` (local projects push the branch to their `origin` first; git projects need a GitHub URL). Delivery never fails the task; the branch is the deliverable and the PR URL lands in `task.artifacts.prUrl`.
6. **Cleanup.** The sandbox is removed immediately; task and config volumes live `retention.taskVolumeHours` (24 h) and are swept by the GC job (`ho gc`).

## 9. Office simulation (`@ho/sim`, pure)

- **Building = floors.** Floor 0 _Lobby_: boss office, reception with the **Board**, mailroom with mailbox, kitchen, relax room, smoking room, toilets, elevator. Floors 1..N: one per project from a **floor template** (desk clusters with monitors, whiteboard showing the project's board summary, kitchenette, toilet, elevator). Templates are JSON (tile layers + furniture + walkable mask + named anchors), so layouts change without code.
- **Elevator.** Cross-floor movement: walk to elevator → doors → hidden for `travelTime` → appear on target floor. Handoffs across projects and coffee trips to the Lobby use it. A tiny building strip in the UI shows who is on which floor.
- **Movement.** Grid A* per floor (walkable mask), 4-direction sprites, smooth interpolation, reservation of seats/anchors to avoid two agents on one chair.
- **Behaviour model.** Utility-based selection over needs (`coffee`, `restroom`, `smoke`, `relax`, `social`, `sleep`) driven by seeded RNG and time since last visit; overridden by **intents** from events: `session.started → go to desk on the project floor and type`, `handoff.started → walk to target (elevator if needed), hand folder, target receives`, `rate_limited/off-hours → sleep at relax room`, `ho_ask_human → question bubble at desk`, `task.done → celebrate`. Idle agents wander, chat in pairs (speech bubbles), make coffee.
- **Emotions.** Derived: `focused` (tool calls flowing), `happy` (result ok), `frustrated` (errors/retries), `confused` (question pending), `sleepy` (rate limited), `relaxed` (idle). Rendered as bubble icons.
- **Determinism and cost.** Fixed 20 Hz tick, seeded RNG, no allocations in the hot path; `@ho/ui` renders at ≤30 fps and pauses the ticker when the window is hidden. Static tile layers are baked once per floor with `cacheAsTexture`.
- **Postman** (Phase 6): a special non-agent character spawned by `mail.received`: enters, drops an envelope in the mailbox; the `clerk` role (or any idle worker) fetches it to the boss.

## 10. UI (`@ho/ui`)

Left: office canvas (current floor) with floor tabs and building strip. Right: chat with the boss (streaming), task cards linked to floors. Panels: **Board** (per project: inbox/planned/in progress/review/done), **Agent inspector** (live normalised event log, usage, current branch, "open terminal" later), **Usage** (tokens per agent/project/day, rate-limit state, cache hit share), **Resources** (containers, volumes, disk from `docker system df`, one-click prune), **Settings** (projects, agents, budgets, auth). All data through the oRPC contract; the Pixi scene subscribes to the Zustand store directly.

## 11. Security model

- Containers: non-root `agent` user (also required by `--permission-mode bypassPermissions`), `CapDrop: ["ALL"]`, `SecurityOpt: ["no-new-privileges"]`, `ReadonlyRootfs` + tmpfs, `PidsLimit`, `Memory`/`NanoCpus` limits, `--init`, no host bind mounts (only the git-bridge sees the host repo), dedicated bridge network `ho-agents` with `enable_icc=false`.
- Egress: Phase 8 adds an allowlist HTTP(S) CONNECT proxy container (Bun) and sets `HTTPS_PROXY` in agent containers; required hosts per Claude Code docs: `api.anthropic.com`, `platform.claude.com`, `claude.ai`, plus git/package hosts per project. Until then: default bridge egress with telemetry disabled.
- Secrets: `SecretStore` (Keychain). OAuth token reaches only the `claude` process env via the runner's authenticated WS. One-time runner tokens expire in 60 s. No secrets in images, container config, labels, logs or events.
- Daemon: `127.0.0.1` only, per-launch bearer token shared with the webview by Electrobun RPC (never in the URL). Remote/server mode (Phase 8): `--host`, TLS certificate, long-lived token; recommended path is an SSH tunnel or Tailscale.
- Inputs: all RPC/MCP/JSONL parsed by Zod; agent output is data. Task branches are pushed to `ho/*` only; merging is a human action (or an explicit setting).
- No telemetry from HO itself.

## 12. Resource hygiene

- Everything HO creates carries labels `ho.managed=true`, `ho.kind=session|bridge|cache|image`, `ho.session=<id>`, `ho.project=<id>`, `ho.created=<iso>`.
- `GcJob` (Bun `setInterval` in the daemon, plus on startup): removes exited session containers, task volumes past retention, dangling images from rebuilds, cache volumes above `cacheVolumeMaxGB`; reports to the Resources panel. `ho doctor --prune` for manual runs.
- Idle sessions are stopped after `idleStopMinutes` (default 10) and their containers removed; resume recreates from the kept config volume when allowed.
- One agent image, rebuilt only when `images/agent/**` or the pinned Claude Code version changes (content hash label). No per-agent images.
- SQLite in WAL mode with periodic `PRAGMA wal_checkpoint(TRUNCATE)`; event payloads capped (large tool outputs are summarised, not stored); logs rotated by size.
- UI: 30 fps cap, pause when hidden, no per-frame React renders.

## 13. Token economy (built in, not optional)

- **Role defaults**: boss `opus` (or `fable` if the seat allows) at `high`; workers `sonnet` at `medium`; reviewer `sonnet` at `high`; clerk/triage `haiku` at `low`. All per agent overridable.
- **Lean context per session**: our own `settings.json` only (`--setting-sources user` pointing to our config dir, no project `.claude/` from the cloned repo unless enabled per project), `--strict-mcp-config` with a single MCP server, `--plugin-dir` with ≤5 role skills, a ≤60-line role prompt via `--append-system-prompt-file`, no auto memory, no CLAUDE.md beyond the project's own (optional).
- **RTK** PreToolUse hook in the image compresses Bash output (git/test/build) by 60–90%.
- **Budgets and stops**: `--max-turns`, wall-time caps, review-round caps; scheduler concurrency default 2; pause on `rate_limited`.
- **Cache-aware**: keep sessions alive and resume within the subscription's 1-hour prompt-cache TTL; never change system prompt or tool set mid-session.
- **Structured, short reports**: `ho_report` with a schema (≤1,500 chars summary) instead of long prose; boss receives summaries, never raw transcripts.
- **Compaction**: `--autocompact` tuned per role; compaction instructions in the role prompt ("keep decisions, branch, failing checks").
- **Measure**: every `result` event's usage lands in `usage.recorded`; the Usage panel shows tokens per agent/task/day, cache-hit share and rate-limit incidents so the owner can tune models/effort with data.

## 14. Configuration and data locations

- `~/.config/home-office/config.json` (Zod-validated; projects, agents, budgets, retention), `~/.config/home-office/ho.db`, `~/.config/home-office/logs/`. Override with `HO_HOME`.
- Secrets in macOS Keychain service `home-office` (`security add-generic-password`); Linux fallback `~/.config/home-office/secrets.json` (0600).
- First-run wizard (desktop) / `ho doctor` (CLI): checks Docker API, builds the agent image, asks for the token from `claude setup-token` (pasted; the CLI cannot complete the browser flow headlessly), stores it, runs a smoke session.

## 15. Extensibility roadmap

- **GCP `SandboxProvider`** (Cloud Run Jobs or GKE Autopilot): same `SandboxSpec`; runner dials back over a tunnel/HTTPS; git-bridge pushes to the remote instead of a host path.
- **Runtimes**: `runtime-acp` covers Gemini CLI (`gemini --acp`), OpenCode (`opencode acp`, local models), Codex (`codex-acp`). Anthropic API-key mode is a `SecretStore` entry plus `ANTHROPIC_API_KEY` for `claude`.
- **Connectors**: Jira, GitLab issues, Linear via the same `IntakeConnector`.
- **Multi-floor variants**: floors per team instead of per project are a template change only.
