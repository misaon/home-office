# Home Office architecture

Implementation reference, reviewed 2026-09-08. Historical decisions and work logs live in
[PLAN.md](PLAN.md); audit findings and research are in [audit/2026-09.md](audit/2026-09.md).
This document distinguishes implemented behavior from future work.

## Processes and boundaries

Home Office is a local multi-agent coding harness with a pixel-art office. An Electrobun main process
runs the Bun daemon; its webview loads the React/PixiJS UI served by that daemon. The CLI can instead
start the same daemon library and connect to it over oRPC/WebSocket. The supported desktop target is
macOS Apple Silicon with Docker Desktop. Agent images contain Linux arm64 musl binaries. Linux CI
checks the TypeScript and builds cross-target binaries; it does not establish Linux desktop support.

The daemon owns SQLite, the Docker socket, repository publication and host GitHub credentials. Each
agent runs as a non-root process inside a temporary Docker container. A compiled `ho-runner` connects
outbound to the daemon's authenticated WebSocket gateway and relays one child process. Credentials
arrive in a spawn message and enter that child's environment. The runner token is not inherited by the
child. A separate short-lived git-bridge container copies a repository into a Docker task volume and
publishes its result branch back to the host. Agent containers never mount the host repository.

The simulation is a visual projection. It controls envelope timing while a viewer is present, with a
30-second daemon timeout; it cannot determine task success, permissions or publication results.

## Packages

| Location                       | Responsibility                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `apps/desktop`                 | Native window, single-instance lock and in-process daemon lifecycle                 |
| `apps/cli`                     | Commands, argument resolution and authenticated daemon connection                   |
| `packages/protocol`            | Zod schemas, IDs, events, provider catalog, RPC and MCP contracts                   |
| `packages/core`                | Pure domain commands, projections, scheduling decisions and adapter ports           |
| `packages/daemon`              | Composition, lifecycle, scheduling, RPC/MCP, intake, publication and static serving |
| `packages/store`               | SQLite event log, Drizzle schema and migrations                                     |
| `packages/sandbox-docker`      | Docker Engine API, image builds, containers, volumes and resource inventory         |
| `packages/runtime-claude-code` | Claude stream-json process adapter, resume and usage translation                    |
| `packages/runtime-acp`         | ACP negotiation, streams, events and OpenCode/Gemini/Codex presets                  |
| `packages/intake-github`       | Host `gh` issue polling and acknowledgement adapter                                 |
| `packages/secrets`             | Native Bun secret store and atomic owner-only file fallback                         |
| `packages/sim`                 | Pure office layout, movement, reservations, needs and envelope choreography         |
| `packages/ui`                  | React panels, Zustand projection, TanStack Query requests and Pixi rendering        |
| `packages/agent-kit`           | Role skill packs copied into provider images                                        |
| `scripts`                      | Checked build, desktop, sprite-import and manifest tooling                          |

`core` and `sim` have no I/O or Bun/DOM globals. The actual port definitions live in
`packages/core/src/{ports,runtime,sandbox,intake}.ts`; read those definitions rather than copying an
approximate interface from documentation. Runtime TypeScript is executed directly; the UI and release
binaries have build steps.

## Domain and persistence

One project is one floor and one immutable repository identity. Creating it also creates its boss
Andrew; imported agents are copies with new IDs. Lola is a simulated receptionist, not an AI provider
session. Names are unique within a floor. Agents, tasks, chat and active sessions are scoped to a floor;
commands reject cross-floor assignments and unsafe deletion of live work.

A task carries its brief, assignee, parent/source, state, notes and artifacts. A session is one container
lifetime for one task and agent. Read schemas in `packages/protocol/src/domain.ts` for exact fields and
states. The daemon serializes domain decision, event append and projection application. SQLite appends
batches transactionally; sequence numbers prevent replay from double-applying events. UI clients replay
the same events into their own pure read model and then follow live events.

SQLite uses WAL and versioned Drizzle migrations. A replay validation failure preserves the database
and fails startup. It never silently starts a new database. Unsupported historic event schemas require
an explicit migration or restore. Snapshots, automatic event compaction and log retention are not
implemented; historical projections and startup replay grow with retained history.

Startup holds a refreshed `proper-lockfile` lock on the state directory. Resources unwind through
`AsyncDisposableStack` on failure and shutdown. Jobs and pending session work are awaited before storage
closes. Restart reconciles interrupted sessions with managed containers and blocks affected tasks for
explicit resumption. An unavailable Docker service prevents recovery of previously active sessions.

## Work and repository flow

1. A local project uses an existing checkout. A remote project uses a host bare repository under
   `$HO_HOME/mirrors/<projectId>.git`, refreshed under a lock by fetching its default branch. Fetches do
   not prune or overwrite unpublished task branches.
2. Git-bridge mounts the source read-only while cloning into a task volume. Clones avoid hardlinks and
   disable hooks and fsmonitor. New work branches use `ho/task-<taskId>`; recorded branches remain valid.
3. Agents work inside `/work/repo`. Task and per-agent provider-state volumes survive sessions so work
   and supported provider conversations can resume. Triage/review restrictions are instructions; the
   task workspace itself is not made read-only for those modes.
4. Workers call `ho_report`; the daemon stages work reports until publication succeeds. Git-bridge
   publishes using a normal push, without force. Remote delivery uses host git credentials. A project
   with pull-request delivery also uses host `gh`, reusing a matching open PR when present.
5. Publication/delivery failure blocks the task. Success records artifacts and applies the report,
   selecting a reviewer when configured. Review approval finishes work; requested changes return it to
   its author subject to the review-round cap. A review without a verdict blocks for human attention.
6. Session containers are removed. Task/config volumes are eligible for GC according to creation age
   and active-container protection. Retention is not a sliding inactivity timer; publish valuable work
   and do not rely on old volumes as permanent storage.

The boss turns chat/mail into scoped delegated tasks with `ho_delegate`, replies through `ho_reply`,
and ends triage with `ho_report`. Questions block work until the human answers the task in chat.
Deterministic boss status messages report progress without making extra model calls. Handoffs remain
within a floor. The daemon's MCP server validates each call against the session and mode.

GitHub intake paginates open issues matching project labels, deduplicates received mail in the event
log, and supports dry-run polling. Acknowledgements are best-effort: delivery does not yet have a
persistent retry outbox. Host `gh auth login` supplies GitHub access; the reserved `github-token` secret
key is not wired to publication or intake. Intake can publish comments/labels when enabled by the owner.

## Provider behavior and cost

Claude Code uses stream-json and supports subscription-token or API-key authentication, model aliases,
effort, resume, turn limits and API USD limits. ACP adapters negotiate protocol/auth/MCP capabilities,
then create or load sessions. HTTP MCP support is required for office tools. Codex accepts a model ID
and reasoning effort through `CODEX_CONFIG`; `default` retains its default model. MCP and runner secrets
are separate, session-scoped credentials.

Wall-time and concurrency caps apply across providers; review-round caps belong to tasks. Legacy
configuration names `maxTurnsPerTask` and `maxUsdPerTask` currently supply **per-session Claude CLI
limits**, not aggregate task caps across retries. ACP does not expose an equivalent enforced USD/turn
budget here. ACP `turns` is an approximation from tool calls, and provider token accounting is not yet
complete. Zero reported usage is not proof that a provider ran for free. Verify spending in the provider
account as well as the office Usage panel.

Default role/model choices are editable. RTK's Claude hook compacts supported shell output; actual token
savings depend on the workload. Failed raw command output remains available in temporary storage. The
image contains both browser MCP servers, but sessions expose Playwright by default; `browser.devtools`
enables Chrome DevTools as well. `browser.enabled=false` removes browser tools from sessions. Browser
profiles, config and caches are temporary. No egress allowlist or CONNECT proxy is implemented.

## Simulation, sprites and UI

The layout is pure data in `packages/sim`: rooms, collision cells, furniture, anchors and elevator state.
Every project uses an independent instance of the plan. `CELL_PX` defines the rendering/import scale;
art dimensions and layer alignment are documented in [OFFICE-ART.md](OFFICE-ART.md) and
[assets/README.md](../assets/README.md). Original art is preserved separately from imported PNG frames.
Sharp handles image encoding/decoding. Manifests use content-derived revisions and report missing keys;
missing furniture renders geometric stand-ins.

Movement uses a weighted grid A* with a TinyQueue heap, clearance and turn costs, plus explicit actor
reservations. Needs and seeded RNG drive idle behavior. Plan steps describe walking, dwelling, emitting
handoff completion and leaving the office; queued envelope deliveries survive later intents. Each floor
has its own elevator and animations. Simulation stepping is fixed and catch-up is bounded.

Pixi renders at at most 30 fps, pauses in hidden documents, updates visible actors and keeps at most two
floor views cached. ResizeObserver updates camera fitting. Sprite requests are coalesced. React reads
immutable Zustand snapshots; TanStack Query deduplicates and cancels health/resource/usage requests.
The live log retains at most 20 sessions with 300 events each. Historical domain state is not bounded by
those live-log limits. Source reload polling is only present in development UI builds.

## Security and operational limits

- The daemon accepts loopback bindings only (`127.0.0.1`, `::1`, `localhost`) and checks bearer tokens and
  request origins. Remote plaintext binding is rejected. There is no implemented remote TLS/server mode.
- Desktop preload places the launch token in sessionStorage. CLI browser launch uses a URL fragment,
  removed immediately by the UI. `daemon.json` and file-backed secrets use atomic mode-0600 writes.
- Static files reject malformed/traversal/symlink escapes, carry security headers and revalidate mutable
  content. The RPC and runner connections use bounded payloads/queues, backpressure and startup deadlines.
- Containers use non-root users, dropped capabilities, no-new-privileges, read-only rootfs, tmpfs,
  memory/CPU/PID limits, no extra swap allowance and bounded Docker logs. Docker still provides general
  outbound networking. Container isolation is not a defense against a compromised Docker daemon/kernel.
- Provider credentials are sent to the selected child process. They are deliberately absent from Docker
  config/labels and persisted events. Model/tool output is untrusted and can itself contain sensitive
  data; the application does not promise universal content redaction.
- Both runtime adapters escalate termination to SIGKILL and stop waiting after 15 seconds. HTTP/git/gh
  operations have deadlines. CLI/UI connection attempts time out after 10 seconds.
- No automatic merge, provider failover, persistent acknowledgement outbox, sliding volume retention,
  reusable project cache volumes, OS-wide resource monitor or remote deployment backend is implemented.

The unsigned desktop build is assembled with a revision/checksum-pinned Hutch toolchain. Release builds
validate the tag and its ancestry on `main`; a separate job holds GitHub publication permissions. See
[STACK.md](STACK.md) for dependencies and [audit/2026-09.md](audit/2026-09.md) for tradeoffs and follow-ups.
