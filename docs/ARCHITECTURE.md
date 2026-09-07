# Home Office — Architecture

Home Office (HO) is a local multi-agent harness: a Bun daemon orchestrates AI coding agents that run inside isolated Docker containers, and a desktop app renders the team as a pixel-art office (LimeZu _Modern Office_ style, 16×16 tiles). The office is a **projection of the event stream**; nothing in the simulation is authoritative.

Decisions taken with the owner on 2026-09-06: Electrobun desktop shell · Docker Engine API directly (no Swarm services) · isolated clone per task with results pushed as branches; on 2026-09-07 (D23): **one floor per project**, every floor with its own boss Andrew and the receptionist Lola. See `docs/PLAN.md` § Decisions.

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
│   └─ WKWebView  ← loads the @ho/ui bundle from the daemon (HTTP)    │
│                    token parked in sessionStorage by a preload       │
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
│  ├─ desktop/               # Electrobun app (Hutch project): electrobun.config.ts, src/bun/ (starts daemon), native shell only
│  └─ cli/                   # `ho` binary: daemon, project, agent, task, session, usage, doctor
├─ packages/
│  ├─ protocol/              # Zod schemas, branded IDs, domain events, oRPC contract, MCP tool schemas (shared by all)
│  ├─ core/                  # pure domain: task state machine, scheduler, budgets, handoff rules, ports (interfaces)
│  ├─ store/                 # EventStore + projections on bun:sqlite + Drizzle; migrations
│  ├─ daemon/                # composition root: oRPC WS server, static UI serving, runner gateway, HO MCP server, GC jobs, config
│  ├─ sandbox-docker/        # SandboxProvider for Docker Engine API (containers, volumes, networks, exec, stats, prune)
│  ├─ runtime-claude-code/   # AgentRuntime for Claude Code headless (stream-json codec, session resume, usage, errors)
│  ├─ runtime-acp/           # generic ACP client runtime over the runner relay: OpenCode, Gemini CLI, Codex presets
│  ├─ intake-github/         # IntakeConnector polling GitHub Issues through the host's `gh` (comments/labels back)
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

| Entity              | Key fields                                                                                                                                                                                                                            | Notes                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**         | `id`, `name`, `repo: { kind: "local", path } \| { kind: "git", url }`, `defaultBranch`, `publish`, `intake`                                                                                                                           | One floor per project (D23): the same plan, its own boss and staff. Created with its boss; removing it removes the team.                                                                                |
| **Agent** (persona) | `id`, `name`, `role` (`boss` \| `worker` \| `reviewer` \| `clerk`), `appearance` (sprite set, gender), `provider`, `auth`, `model`, `effort`, `basePrompt`, `skillPack`, `budgets` (max turns/task, concurrent sessions), `projectId` | Exactly one `boss` per floor (Andrew, created with the project); names are unique per floor. Personas are config; compute is per session. Lola, the receptionist, is an office character, not an agent. |
| **Task**            | `id`, `projectId`, `parentId?`, `title`, `brief`, `status`, `assigneeId?`, `source` (`chat` \| `mail:<connector>` \| `delegation`), `artifacts` (branch, PR URL, report), `priority`, timestamps                                      | Status machine: `inbox → planned → assigned → in_progress → review → done` with side exits `blocked`, `failed`, `cancelled`.                                                                            |
| **Session**         | `id`, `taskId`, `agentId`, `sandboxId`, `runtimeSessionId` (Claude session UUID), `state`, `usage` (input/output/cache tokens, turns, wall time), `containerId`, `volumeId`                                                           | A session is one container lifetime working on one task.                                                                                                                                                |
| **Handoff**         | `id`, `taskId`, `fromAgentId`, `toAgentId`, `brief`, `state`                                                                                                                                                                          | Drives the "walk over and hand the folder" animation.                                                                                                                                                   |
| **MailItem**        | `id`, `connector`, `externalId`, `payload`, `state`                                                                                                                                                                                   | Postman/mailbox pipeline (Phase 6).                                                                                                                                                                     |
| **ChatMessage**     | `id`, `projectId`, `author` (`human` \| agentId), `text`, `taskId?`                                                                                                                                                                   | One chat per floor, between the human and that floor's boss.                                                                                                                                            |
| **Event**           | `id` (UUIDv7), `type`, `payload`, `at` (ISO-8601), `correlationId`, `causationId`, `actor`                                                                                                                                            | Append-only. Types are a Zod discriminated union in `@ho/protocol` (e.g. `task.created`, `task.assigned`, `session.started`, `agent.tool_call`, `handoff.started`, `usage.recorded`, `mail.received`).  |

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

// Which brain (one runtime per provider in the catalog; see § 6a)
interface AgentRuntime {
  readonly id: ProviderId; // "claude-code" | "opencode" | "gemini-cli" | "codex"
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

// Where work comes from (host-side adapters; the daemon dedupes against mail already in the log)
interface IntakeConnector {
  readonly id: MailConnector; // "github-issues" today
  poll(project: Project, signal?: Cancellation): Promise<IntakeItem[]>; // open items matching project.intake
  acknowledge(project: Project, mail: MailItem, ack: MailAck, signal?: Cancellation): Promise<void>; // comment/label back
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

**Browser tooling (D15).** Work and review sessions also get two stdio MCP servers that live in the image (`/opt/ho/mcp`): Playwright MCP and Chrome DevTools MCP, both pointed at the distribution's headless Chromium with an isolated profile and `--no-sandbox` (Chromium's own sandbox needs user namespaces the hardened container does not grant; the container remains the boundary). Dev servers the agent starts bind to 127.0.0.1 inside the same container, so the browser reaches them without any host access. Screenshots and traces go to the `/tmp/browser` tmpfs; the prompt tells agents to copy what belongs in the repository. Triage sessions get no browser. Bun, Node and npm are available for the agents' projects.

## 6a. Providers, the ACP runtime and image variants (D18)

- **Catalog.** `PROVIDERS` in `@ho/protocol` describes each provider: protocol (`stream-json` for Claude Code, `acp` otherwise), auth kinds (`subscription` | `api-key` | `none`), suggested models (`freeFormModels` lets a CLI accept any id), effort support, the CLI's state directory (mounted from the per-task config volume so conversations resume) and scratch directories (tmpfs on the read-only rootfs). Agents carry `auth`; `createAgent`/`updateAgent` validate provider/auth/model/effort against the catalog and a provider switch falls back to that provider's defaults. The secret an agent needs follows its provider (`secretKeysFor`); for OpenCode it follows the model's `provider/` prefix (`anthropic/…` → `anthropic-api-key`, `ollama/…` → none). Secrets travel as environment only (`SECRET_ENV`).
- **ACP runtime.** `@ho/runtime-acp` speaks the Agent Client Protocol (JSON-RPC over the agent's stdio, relayed by `ho-runner`) with the official SDK: `initialize` (protocol 1, no fs/terminal capabilities: the agent's own tools act inside the sandbox) → on `auth_required`, `authenticate` with the preset's preferred method → `session/new` with the office MCP server (http) and the browser servers (stdio), or `session/load` when the agent advertises it and the task has a resume id → one `session/prompt` per office session. `agent_message_chunk` → `text_delta`, `tool_call`/`tool_call_update` → `tool_call`/`tool_result`, permission requests are answered with the most permissive option and surfaced as `permission_request`, the stop reason becomes `result` (or `max_turns`). The system prompt appendix is prepended to the first prompt of a new conversation. Presets: `opencode acp --cwd` with `OPENCODE_CONFIG_CONTENT` (model, open permissions, no autoupdate/share), `gemini --acp --model … --approval-mode yolo`, `codex-acp` (Codex's default model).
- **Images.** One Dockerfile, one target per provider (`base` → `claude-code` | `opencode` | `gemini-cli` | `codex`); refs `ho/agent:dev` (Claude Code) and `ho/agent-<provider>:dev`. `ensureImages`/`imageStatus` cover Claude Code plus every provider the roster uses; the session's sandbox uses its provider's image, state dir and scratch tmpfs.
- **API-key mode.** A Claude Code agent with `auth: "api-key"` receives `ANTHROPIC_API_KEY` instead of the OAuth token and, when `budgets.maxUsdPerTask` is set, `--max-budget-usd`.

## 7. Orchestration and the collaboration protocol

- **Floors (D23).** Every project is a floor. `projects.create` appends the project and its boss (Andrew: `opus`/`high`, sprite `boss`, skill pack `boss`) in one command, plus copies of any characters imported from other floors (`importAgentIds`; bosses are never imported). `projects.inspect` checks a path or URL with the host's `git` first (is it a repository, its name, its default branch). Agents belong to exactly one floor; `agents.copy` puts the same character on another floor. Removing a floor removes its team; open tasks must be closed first.
- **Mail loop (intake).** Projects with `intake.enabled` are polled on their interval by `@ho/intake-github` (`gh issue list --json …`, label filter, 50 newest open issues). A new issue becomes a `MailItem` (`mail.received`) and a triage task for the floor's boss whose brief carries the issue; without a boss it lands in the project inbox as a work task. The office replies on the issue: received (comment + `intake.ackLabel`), delegated (per child task), and the outcome of mail-born work (done/blocked/failed with branch, PR link, report). `dryRun` polls and reports without creating anything. `ho intake poll|status`, `ho mail list`, Settings → project → intake.
- **Boss loop (triage).** A human chat message to a floor (`chat.send({ projectId })`) becomes a `triage` task in that project assigned to its boss; the scheduler starts a `triage` session once Lola has carried the envelope to him (see § 10, handoff gating). The triage prompt carries the floor's staff (names, roles, skill packs, load) and the repository checked out read-only for planning. The boss acts through tools: `ho_delegate` (one task per independent piece of work, assigned to a colleague of the floor — or to himself when the floor has no staff or nobody fits; a self-assigned task runs as an ordinary work session), `ho_reply` (talk to the human), `ho_list_agents`, then `ho_report(done)`. The final text of a triage session is posted to chat when the boss did not already reply.
- **Boss voice.** The daemon posts deterministic status lines in the floor's chat as the boss (`boss-voice.ts`, no tokens): "I have handed X to Pam" / "I will take care of X myself" on delegation, "Pam is working on X", "Pam finished X; Dwight is reviewing it", "Dwight asked for changes on X", "X is done" with report, branch and PR link, "X is blocked/failed: reason", and "I could not process your message" when a triage session fails. When finished work walks back to the boss in the office, the line waits for that envelope (same gate, 30 s cap, no wait without viewers). Questions colleagues ask (`ho_ask_human`) stay their own messages; the human answers them from the chat.
- **Worker loop (work).** The session prompt names the branch and the protocol; the worker commits and calls `ho_report` (`review`, `done` or `blocked`, summary ≤ 1,500 chars). A report on a project with a reviewer member automatically assigns that reviewer and moves the task to `review`. When the agent ends without reporting, the daemon files the result text on its behalf. Branch push and delivery happen at this point (§ 8).
- **Review loop.** The scheduler starts a `review` session for the task's reviewer (prompt: diff against the default branch, no edits) who calls `ho_review`: `approve` → `done`; `request_changes` → findings become a task note, `reviewRounds` increments, the task returns to `assigned` for the author (or `blocked` once the author's `maxReviewRounds` is exceeded). A review that ends without a verdict blocks the task for the human.
- **Handoff.** `ho_handoff(toAgent, brief)` records `handoff.requested` (the office animation's trigger), adds a `handoff` note, reassigns and re-queues the task; the current session ends. Only colleagues of the same floor can receive a task.
- **Questions.** `ho_ask_human(question)` posts the question to chat, notes it and blocks the task. The human answers with `chat.send({ taskId })` (`ho chat --task <id> "..."`); the task returns to `assigned` and the same agent's session **resumes**.
- **Resume.** Every session of the same agent on the same task reuses the task volume (repository state) and a per-agent Claude config volume, and passes the previous Claude session id with `--resume`, so context survives review rounds, handoffs back and human answers. The opening message lists the notes added since the previous session; a resume whose conversation is gone falls back to a fresh conversation once.
- **Budgets.** Per task: `maxTurnsPerTask`, `maxWallMinutes` (aborts the session), `maxReviewRounds`. Per agent: `maxConcurrentSessions`. Global: `scheduler.maxConcurrentSessions` (default 2) protects the subscription's rolling 5-hour window; `rate_limited` marks the session idle.
- **HO MCP server.** Streamable HTTP (`@modelcontextprotocol/sdk`, stateless JSON responses) on the daemon at `/mcp`, reachable from sandboxes via `host.docker.internal`. Every session gets its own bearer token; each request builds a small `McpServer` bound to that session (and its floor), exposing only the tools its mode allows, so a tool call can never touch another task or floor. Inputs are Zod schemas from `@ho/protocol`; every call becomes domain events.

## 8. Repository flow (git-bridge, mirrors, delivery)

1. **Source path.** A `local` project is its host checkout. A `git` project is mirrored on the host at `$HO_HOME/mirrors/<projectId>.git` with the owner's own git credentials (`git clone --mirror`, refreshed with `git fetch --prune` before every session). Sandboxes and bridges only ever see host paths; no remote credential enters a container. Every session, triage included, gets the clone (the boss plans against the code; his prompt forbids edits and nothing is published from a triage session).
2. **Clone.** `session.starting` → create the labelled task volume (`ho.kind=task-volume`) and Claude config volume (`ho.kind=claude-config`) → run `git-bridge` with the source mounted **read-only** at `/src`: `git clone --branch <default> --single-branch /src /work/repo && git checkout -b ho/<task-slug>-<shortid>`.
3. **Work.** The agent works in `/work/repo` only. Caches mount from per-project cache volumes (Phase 8).
4. **Push.** On success the bridge runs exactly `git -C /work/repo push -f /src HEAD:refs/heads/ho/<branch>` with the source mounted **read-write**; the agent container never has that mount. For `git` projects the daemon then pushes the branch from the mirror to the real remote (`git push origin`) with host credentials.
5. **Deliver.** Per project `publish` policy: `branch` (default) stops here; `pull-request` also runs the host's `gh pr create --head <branch> --base <default> [--draft]` (local projects push the branch to their `origin` first; git projects need a GitHub URL). Delivery never fails the task; the branch is the deliverable and the PR URL lands in `task.artifacts.prUrl`.
6. **Cleanup.** The sandbox is removed immediately; task and config volumes live `retention.taskVolumeHours` (24 h) and are swept by the GC job (`ho gc`).

## 9. Office simulation (`@ho/sim`, pure)

- **One plan, one floor per project (D23).** `officePlan(floorId)` (`office-plan.ts`) is pure data: 80 × 46 cells (`CELL_PX` each), rooms with surfaces, walls, doors, fixed glazing, placed objects with sprite keys and footprints, named **anchors** (`desk` with a seat group `dev`/`qa`/`analyst`, `boss-desk`, `coffee`, `restroom`, `smoke`, `relax`, `sleep`, `mailbox`, `entrance`, `reception`, `whiteboard`, `elevator`, `car`, `wander`); anchors in the boss office carry `group: "boss"` and are his alone. The UI adds one floor per project (id = project id) and shows the selected one; every floor has its own elevator, reservations and door animation. `gridFor` derives the collision grid (walls, void, blocking furniture); `auditOffice` reports unreachable anchors, blocked doors and disconnected cells.
- **Actors.** Kinds: `boss` (starts at his desk, which is his home), `staff` (arrive by elevator), `receptionist` (Lola, one per floor, home at the reception counter; an office character without an agent record) and `visitor` (the postman). Actor names come from the read model or the character (`Lola`, `Postman`).
- **Movement.** Grid A* with cached clearance and direction-aware turn costs (walls and furniture cost 4 per step alongside, 1.5 two cells away, 1 further; a turn costs 6) so agents keep to corridor centres and straight runs; a destination occupied by a standing actor stays reachable (meeting points). 4-direction sprites (west = flipped east), smooth interpolation, anchor reservations (a home stays reserved for good). Actors execute **plan steps** (`walk`, `dwell`, `hold`, `away`, `emit`); an in-progress handoff survives later intents (`pendingHandoff`).
- **Seats.** `assignWork(world, agent, floor, role)`: the boss sits at his desk, workers take `dev` desks, reviewers `qa`, clerks `analyst`, a full zone overflows to any free desk. Somebody who is off the floor is summoned: the next car brings them in and they walk straight to the desk.
- **Behaviour model.** Utility-based selection over needs (`coffee`, `restroom`, `smoke`, `relax`) driven by seeded RNG and time since last visit. The boss only leaves his office for a coffee or the restroom (needs grow four times slower, the nearest spot wins) and returns to his desk; staff stroll their room, the lounge, the kitchen and the terrace, and now and then ride the elevator away for one to two minutes (`away`), coming back on their own. Overridden by **intents** from events: `session.started → assignWork and type`, `handoff.requested → the carrier walks the envelope to the recipient, hands over, emits handoff_delivered, both return`, `rate_limited → sleep at a sleep anchor until the next runtime event`, `task question note → question bubble until answered`, `session.ended → celebrate when it stopped cleanly`, `human chat message → Lola carries the envelope from the reception to the boss (envelope_delivered)`, `mail.received → postman from the elevator to the reception counter, Lola to the boss`, `work done or blocked → the worker (or the approving reviewer) walks the envelope back to the boss`.
- **Emotions.** Derived: `focused`, `happy`, `frustrated`, `question`, `sleepy`, `relaxed`; rendered as bubble sprites.
- **Determinism and cost.** `tick(world, dtMs)` with the frame delta clamped to 250 ms, seeded RNG (mulberry32); `@ho/ui` renders at ≤30 fps and pauses the ticker when the window is hidden.

## 10. UI (`@ho/ui`)

Before the first project the window is black with one button, "Add a project (floor)" (Setup stays reachable in the corner). The add-project dialog takes a repository path or URL, has the daemon inspect it (`projects.inspect`: git, name, default branch), offers characters of other floors to import, and creates the floor with its Andrew and Lola. Then: a header with **floor tabs** (numbered by creation, "+" adds a floor), the office canvas of the selected floor on the left, and on the right the panels of that floor: **Chat** with its boss (Lola brings him the message; his status lines report progress), **Board** (inbox/planned/in progress/review/done), **Agent inspector** (live normalised event log, usage, current branch), **Usage** (tokens per agent/project/day, rate-limit state, cache hit share), **Resources** (containers, volumes, disk from `docker system df`, one-click prune), **Settings** (floors, the floor's team with "copy to floor", auth). All data through the oRPC contract; the Pixi scene reads the simulation world directly each frame, React reads immutable snapshots.

- **Rendering the plan.** `office/plan-view.ts` builds a floor view: architecture (room fills, walls with lit caps) drawn once and cached, glass panels and doors in the sorted object layer (doors slide open when an actor is within three cells), and one node per plan object — the delivered sprite when `furniture/<key>` exists in the manifest (bottom-left on the footprint, native size, state swaps by animation name), else a geometric stand-in in the approved palette (`stand-ins.ts`). `OfficeScene` builds a floor's view the first time it is shown (each is a full cached texture) and owns the camera (fit to the pane's width), characters, bubbles and names; a character set that is not delivered yet (the receptionist's) falls back to `agent-a`. Development builds poll `dev-revision.txt`, written by `bun run ui:watch`, and reload on change.

- **Serving and launch.** The daemon serves the built bundle (`packages/ui/dist`, `bun run ui:build`) at `/` with an SPA fallback and the sprite tree at `/assets/`, both read-only and unauthenticated (they contain no data); `config.ui.dir`/`assetsDir` default to the daemon's `resourcesRoot` (the repository in development, `Resources/app/ho` in the packaged desktop app). `ho ui` opens `http://127.0.0.1:<port>/#token=<daemon token>`; the fragment never reaches the server, the page stores it in sessionStorage, wipes it from the address bar and history, and presents it as the WebSocket subprotocol `ho.bearer.<token>`. A fresh launch URL supersedes the remembered token on reconnect. The desktop window loads the same URL and skips the fragment: a `preload` statement writes the token into sessionStorage before the page runs (D16).
- **First-run checklist.** The UI opens a setup overlay whenever the office cannot work yet (Docker missing or API < 1.44, images missing/stale, no subscription token) unless it was dismissed: Docker check, image build with a streamed log, token paste (`claude setup-token`) and a smoke test that sends a hello to the selected floor's boss and shows the reply. Floors and their teams are not part of it (the empty office offers the first project itself). The header's **Setup** button reopens it; the same checklist serves desktop and browser.
- **State.** The client rebuilds the read model from `events.subscribe` with the same pure reducers as the daemon (`events.head` marks where the replay ends and live handling begins), keeps a bounded live log per session from `sessions.stream`, and publishes immutable snapshots to React through Zustand. Components never read the mutable model: the React Compiler memoises JSX derived from non-reactive module state.
- **Envelope gating.** While the UI holds the `office.presence` stream open, the daemon's `OfficeGate` holds back what an envelope stands for until the office reports `office.delivered({ taskId })` (or 30 s pass, enough for a walk from the far desks to the boss office): the recipient's session of a task whose latest `handoff` note is fresh, the boss's triage session of a chat message or mail item (Lola's walk), and the boss's status line for work that walks back to him. The UI reports at the end of the animation, and immediately when the document is hidden (no animation frames). Without viewers nothing waits.

## 11. Security model

- Containers: non-root `agent` user (also required by `--permission-mode bypassPermissions`), `CapDrop: ["ALL"]`, `SecurityOpt: ["no-new-privileges"]`, `ReadonlyRootfs` + tmpfs, `PidsLimit`, `Memory`/`NanoCpus` limits, `--init`, no host bind mounts (only the git-bridge sees the host repo), dedicated bridge network `ho-agents` with `enable_icc=false`.
- Egress: Phase 8 adds an allowlist HTTP(S) CONNECT proxy container (Bun) and sets `HTTPS_PROXY` in agent containers; required hosts per Claude Code docs: `api.anthropic.com`, `platform.claude.com`, `claude.ai`, plus git/package hosts per project. Until then: default bridge egress with telemetry disabled.
- Secrets: `SecretStore` (Keychain). OAuth token reaches only the `claude` process env via the runner's authenticated WS. One-time runner tokens expire in 60 s. No secrets in images, container config, labels, logs or events.
- Daemon: `127.0.0.1` only, per-launch bearer token. The desktop shell hands it to the webview through a preload statement into sessionStorage (never in a URL); browsers get it in the URL fragment from `ho ui`, which never leaves the machine and is wiped on load. `daemon.json` (0600) is the only copy on disk. Remote/server mode (Phase 8): `--host`, TLS certificate, long-lived token; recommended path is an SSH tunnel or Tailscale.
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
- First-run checklist (UI, desktop and browser alike) / `ho doctor` + `ho image build` + `ho secret set` (CLI): checks the Docker API, builds the images, asks for the token from `claude setup-token` (pasted; the CLI cannot complete the browser flow headlessly), stores it, hires the default team, runs a smoke session.
- Desktop app: `HO_HOME/desktop.lock` (single instance), `HO_HOME/logs/desktop.log` (pino NDJSON; stdout of a packaged app is invisible). Bundled resources live in `Home Office.app/Contents/Resources/app/ho` and mirror the repository paths the daemon reads (`images/`, `packages/ui/dist`, `assets/`, `packages/store/drizzle`); `HO_REPO_ROOT` overrides the location for development.

## 15. Extensibility roadmap

- **GCP `SandboxProvider`** (Cloud Run Jobs or GKE Autopilot): same `SandboxSpec`; runner dials back over a tunnel/HTTPS; git-bridge pushes to the remote instead of a host path.
- **Runtimes**: done in Phase 7 (§ 6a). Next candidates: Codex model/effort through `session/set_config_option`, per-provider usage accounting (ACP's `usage_update` reports context fill, not tokens), Gemini/Codex effort knobs.
- **Connectors**: Jira, GitLab issues, Linear via the same `IntakeConnector`.
- **Floor variants**: a different plan per project (or per team) is a template change only; today every floor uses the approved office.
