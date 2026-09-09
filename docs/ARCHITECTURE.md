# Home Office architecture

Implementation reference, reviewed 2026-09-09. Historical decisions and work logs live in
[PLAN.md](PLAN.md); the findings, measurements and decisions behind the current behaviour are in
[../audit](../audit/AUDIT.md) — `COVERAGE.md` maps them to the audited points and `VERIFICATION.md` holds
the command output each claim rests on. An [earlier audit report](history/AUDIT-2026-09.md) is history.
This document distinguishes implemented behavior from future work.

## Processes and boundaries

Home Office is a local multi-agent coding harness with a pixel-art office. An Electrobun main process
runs the Bun daemon; its webview loads the React/PixiJS UI served by that daemon. The CLI can instead
start the same daemon library and connect to it over oRPC/WebSocket. The supported desktop target is
macOS Apple Silicon with Docker Desktop. Agent images contain Linux arm64 musl binaries. Linux CI
checks the TypeScript and builds cross-target binaries; it does not establish Linux desktop support.

The daemon owns SQLite, the Docker socket, repository publication and host GitHub credentials. Each
agent runs as a non-root process inside a temporary Docker container. `ho-runner`, a Bun bundle executed
by the image's own Bun, connects outbound to the daemon's authenticated WebSocket gateway and relays one
child process. Credentials
arrive in a spawn message and enter that child's environment. The runner token is not inherited by the
child. A separate short-lived git-bridge container copies a repository into a Docker task volume and
publishes its result branch back to the host. Agent containers never mount the host repository.

Native host dialogs are a daemon port, not a UI capability. The same UI bundle runs in the Electrobun
webview and in a plain browser, so `system.pickDirectory` asks the daemon, and the daemon holds a
`DirectoryPicker`: the desktop app injects an open panel owned by its own window through `startDaemon`,
and a daemon started on its own falls back to macOS `osascript`. A host without a dialog answers
`unavailable`, which the office turns into "type the path" rather than an error. The prompt and starting
directory are AppleScript `run argv` arguments, never script source.

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
| `packages/runner`              | The in-sandbox relay: one child process, stdio framing and bounded buffers          |
| `packages/secrets`             | OS credential store via `Bun.secrets`, with an atomic owner-only file fallback      |
| `packages/sim`                 | Pure plane, movement, reservations, needs and envelope choreography                 |
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

Startup takes a single-instance lock on the state directory: an atomic `mkdir` of `daemon.lock` plus a
`holder.json` recording the pid, so a lock left behind by a killed daemon is detected as stale
(`process.kill(pid, 0)`) and taken over instead of blocking the next start. Resources unwind through
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
6. Session containers are removed. Task volumes (`ho.kind: task-volume`) and per-agent provider-state
   volumes (`ho.kind: provider-state`, named `ho-task-<task>-state-<agent>`) are eligible for GC according
   to creation age and active-container protection; the collector still prunes the older
   `claude-config` label so volumes created before that rename do not leak. Retention is not a sliding inactivity timer; publish valuable work
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
budget here.

`turns` is each provider's own definition and the two do not mean the same thing: Claude Code reports
`num_turns` from its result line (model round-trips inside one run), while an ACP session reports the
number of prompts the office sent — one `session/prompt` to one `StopReason` is one turn in that
protocol. It used to report the number of tool calls, which was neither. ACP context-window usage
(`used`, `size`, and cost when the provider sends it) is recorded as a runtime `context` event and is
deliberately not folded into token counters. Provider token accounting is still incomplete: zero reported
usage is not proof that a provider ran for free. Verify spending in the provider account as well as the
office Usage panel.

Default role/model choices are editable. RTK's Claude hook compacts supported shell output; actual token
savings depend on the workload. Failed raw command output remains available in temporary storage. The
image contains both browser MCP servers, but sessions expose Playwright by default; `browser.devtools`
enables Chrome DevTools as well. `browser.enabled=false` removes browser tools from sessions. Browser
profiles, config and caches are temporary. No egress allowlist or CONNECT proxy is implemented.

## Simulation and UI

**The office is being designed again from scratch (2026-09-09, at the owner's instruction).** The art,
the rooms, the furniture and the whole sprite pipeline are gone. What the map is now is a grid, modelled
after Prison Architect and verified against its wiki: the square cell is the atom, and **a wall is the
content of a cell rather than an edge**, so a 4×4 room needs a 6×6 outline.

**The map is the office, and its size is fixed at 60×34 cells.** The pane's ratio grows with the
window, because the 440 px panel and the 53 px bar are fixed; the floor at 1.765 is wider than any of
those panes, so its width is always what limits the fit and the sides are always flush. On a maximised
1920 × 1080 window (a 1480 × 1027 px pane) that is 24.7 px per cell with 94 px of margin above and
below, and nothing to scroll. The margin is the price of a floor whose size is fixed in cells: the
owner asked for the extra width knowing it comes out of the height. An office is a `Layout`
**written in code** (`packages/sim/src/layouts.ts`):
rectangles of floor, of wall and of room designation, objects with a cell footprint, and the anchors its
characters use. `compileLayout` paints those declarations into a `TileMap` — four per-cell layers
(floor, wall, object, room) plus the `blocked` mask the collision `Grid` is derived from, where void, a
wall and a blocking object are impassable and an object that does not block clears its cells (that is a
door). Later rectangles win over earlier ones, so a layout reads top-down. Several layouts can coexist
and a floor picks one by id; there is no builder, because the player never places anything.

Offices are drawn in an **internal editor** that exists in development builds only — `ui-build.ts`
resolves its module to a stub for production, so the shipped bundle carries none of it. It paints walls,
rooms and doors on the grid and saves `layouts/<id>.json` through the daemon, which reads that directory
back and answers `available: false` where there is no repository to write into. The JSON stores what a
cell _is_ — a wall material, a room kind, a door kind — never a colour, so art added later applies to
offices drawn today.

The view draws ground, floors, room tint, the grid, walls, objects and then one dot per character.
The grid is always visible — one hairline of one colour on every cell boundary, the map's outer edge
included — and the camera zooms
with the wheel around the cursor and pans by dragging, clamped so the map cannot be lost off-screen and
centred when it is smaller than the pane. Zooming out has no bound of its own: it stops with the whole
floor in view, because the floor is sized to fit. Zooming in reaches 64 px per cell, which puts a 6×6
room across 384 px — that is what the camera is for. `CELL_PX` is the unit positions are
expressed in, not an art density. Until the owner's next instruction, do not reintroduce art.

Movement uses a weighted grid A* with a TinyQueue heap, clearance and turn costs, plus explicit actor
reservations. Needs and seeded RNG drive idle behavior. Plan steps describe walking, dwelling, emitting
handoff completion and leaving the office; queued envelope deliveries survive later intents. Each floor
has its own elevator and animations. Simulation stepping is fixed and catch-up is bounded.

Both scales the panels use are absolute, set once in `@theme`: `--spacing: 4px` and a px text ramp
(`--text-2xs` 11px through `--text-base` 15px) with their own line heights. A rem scale hung off the
13px root made `text-xs` render at 9.75px and `p-2` at 7px, which is why the panels looked glued
together; the shared primitives in `packages/ui/src/kit` (`Field`, `Section`, `Button`, `Segmented`,
`Modal`) carry the rhythm so a panel does not invent its own.

Pixi renders at at most 30 fps and stops its ticker in a hidden document, but a hidden office is not a
blank one. While the document is hidden the scene draws a still frame — the ticker's own four calls with
`dt = 0`, then one explicit `render()` — once at mount and again on every store change, so a tab that was
never visible still shows its floor the moment it is revealed. The store's update coalescing switches from
`requestAnimationFrame` to a 200 ms timeout for the same reason: a hidden document never runs a rAF
callback, and the pending-bump flag would otherwise stay set and drop every later change. The scene updates
visible actors and keeps at most two floor views cached. ResizeObserver updates camera fitting. Sprite requests are
coalesced. React reads immutable Zustand snapshots; TanStack Query deduplicates and cancels
health/resource/usage requests. The live log retains at most 20 sessions with 300 events each, and the
per-floor chat projection keeps the last 500 messages. Historical domain state is not bounded by
those live-log limits. Source reload polling is only present in development UI builds.

## Security and operational limits

- The daemon accepts loopback bindings only (`127.0.0.1`, `::1`, `localhost`) and checks bearer tokens and
  request origins. Remote plaintext binding is rejected. There is no implemented remote TLS/server mode.
- Desktop preload places the launch token in sessionStorage. CLI browser launch uses a URL fragment,
  removed immediately by the UI. `daemon.json` and file-backed secrets use atomic mode-0600 writes. A tab
  whose token the daemon refuses does not retry: it asks `/health` once, distinguishes "no token" from
  "token refused" — the token is minted per launch, so a tab that outlives a restart holds a stale one —
  and waits for a fresh launch URL, so a forgotten tab cannot fill the log with rejected connections.
  `ho daemon --ui` therefore names the command rather than printing a URL that would need the fragment.
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
- **Accepted risk — outbound network access from agent sandboxes.** Agent containers join the `ho-agents`
  bridge network with inter-container communication disabled and no host mounts, but a bridge network NATs
  to the internet: an agent can reach any host, because the provider CLIs must reach their vendors' APIs.
  Code the model writes therefore _can_ send the contents of its task volume anywhere. What limits the
  damage is everything around it — no host paths in agent containers, a read-only rootfs, all capabilities
  dropped, credentials only in the child process's environment, and the repository reaching the sandbox
  only through a volume the network-less git-bridge populates. The git-bridge itself runs with
  `network: "none"`. Tightening egress would mean an egress proxy on `ho-agents` with a per-provider host
  allowlist; that is a project of its own and is not implemented.
- The daemon token is compared in constant time, and `ho.db` (with its WAL and shm files) is written
  mode 0600; the state directory's mode is re-asserted at every start, not only when it is created.
- Reads of the OS credential store are bounded at 5 seconds and say why they timed out — on macOS a build
  the Keychain has not seen before waits for an access prompt, which used to hang a compiled binary
  indefinitely. A timeout is not treated as "no store here": it propagates rather than silently writing
  the secret into the file backend.
- The daemon's own log file is bounded where nobody watches stdout: the desktop app's destination rotates
  at 8 MiB and keeps one previous file.
- No automatic merge, provider failover, persistent acknowledgement outbox, sliding volume retention,
  reusable project cache volumes, OS-wide resource monitor or remote deployment backend is implemented.

The unsigned desktop build is assembled with a revision/checksum-pinned Hutch toolchain. Release builds
validate the tag and its ancestry on `main`; a separate job holds GitHub publication permissions. See
[STACK.md](STACK.md) for dependencies and [../audit/AUDIT.md](../audit/AUDIT.md) for the tradeoffs,
including the ones the audit decided against: no framework migration (ADR 001), PixiJS kept (ADR 002), the
sprite pipeline kept with `sharp` only where it is byte-identical (ADR 003), and the ~900 MB browser image
split left undone pending an owner decision (B24.1).
