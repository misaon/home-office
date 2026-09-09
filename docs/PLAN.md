# Home Office plan

Current status, reviewed 2026-09-09. This roadmap is separate from the
[historical implementation plan and work log](history/INITIAL-PLAN.md). Its historical checkboxes are
not evidence that every original acceptance target was achieved.

## Implemented

- Bun/TypeScript monorepo with a pure domain and simulation, SQLite event log and typed RPC/MCP.
- One repository per project/floor, a boss per floor, receptionist choreography, staff and chat.
- Docker task sessions, git-bridge publication, optional GitHub PR delivery, review and question loops.
- Claude Code plus ACP adapters for OpenCode, Gemini CLI and Codex; provider-specific images and secrets.
- React/Pixi office, board, inspector, usage/resources/settings and first-run checklist.
- Electrobun macOS arm64 packaging and unsigned release workflow.
- Earlier audit repairs: serialized state changes; safe replay failure; bounded channels and runtime
  shutdown; credential/storage/HTTP hardening; task publication ordering; restart reconciliation;
  bounded renderer caches and fixed-step simulation; Sharp image pipeline; shared UI query management;
  pinned desktop/Docker dependencies; stronger lint and CI checks. Recorded in
  [the earlier audit report](history/AUDIT-2026-09.md), kept as history.
- The September 2026 deep audit, seven waves, every finding and its verification in
  [`audit/`](../audit/AUDIT.md): nine stricter lint rules and a CI daemon smoke check that immediately
  caught a compiled binary which could not start; a deduplicated `errorMessage` and 62 spread guards
  replaced by one typed `compact()`; read-model indexes with revision counters instead of per-bump
  rebuilds; one MCP server per session; an image content hash that actually sees its build context; a
  first frame in a hidden document and updates that no longer stop there; constant-time token comparison
  and 0600 database files; the runner as a bundle on the image's own Bun (1.76 → 1.69 GB); role-aware
  model and effort defaults; a declarative CLI command table with `--json` and readable validation
  errors; provider-state volumes named for the provider; an OS credential store chosen by whether it
  answers; ACP turns that mean turns; and a bounded daemon log. Two of the audit's own findings were
  withdrawn after measurement, and both corrections are recorded beside the original claim.

## Work remaining

These items are not implemented merely because an older plan described them in a completed phase.

| Priority | Work                                            | Completion evidence                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Reliable source acknowledgements                | Persistent retry outbox, idempotent comments and recovery after a daemon restart                                                                                                                                                                                                                                                                                                  |
| High     | Long-term event-log retention                   | Measured replay/storage growth, then snapshots or retention without losing required history. The host log is now bounded (8 MiB, one previous file) and the live log and chat projections have caps; the event log itself still grows without limit                                                                                                                               |
| High     | Complete provider accounting                    | Real token/cost reporting per provider and a way to say "unknown". ACP context-window usage is now recorded as its own event and `turns` means turns per provider, both documented; subscription sessions still report no cost, and the session/task budget split is still Claude-only                                                                                            |
| Medium   | Volume retention based on last use              | Recently used old volumes survive; active volumes remain protected; explicit discard behavior                                                                                                                                                                                                                                                                                     |
| Medium   | Egress policy                                   | Per-project destinations and a verified proxy/firewall boundary compatible with provider/package traffic                                                                                                                                                                                                                                                                          |
| Medium   | Browser/native accessibility and sustained load | Representative multi-floor use, resize/keyboard flows, stable RAM/CPU over a long run                                                                                                                                                                                                                                                                                             |
| —        | ~~Missing art~~                                 | **Superseded 2026-09-09: the office is being designed from scratch.** Every sprite, room and piece of furniture was deleted at the owner's instruction; a floor is a bare plane and characters are dots. The new mechanic and its visuals arrive as owner instructions — see [the rebuild plan](plans/2026-09-09-office-from-scratch.md)                                          |
| —        | ~~Agent image size~~                            | **Decided 2026-09-09: not doing it.** Measured, the browser costs ~1.06 GB of the 1.69 GB image (1.22 GB vs 158 MB for the same layer without chromium and fonts) — but it is stored once for all four provider targets, `browser.enabled` defaults to true, and `chromium-headless-shell` would save only ~150 MB. Evidence and the two alternatives in `audit/AUDIT.md` (B24.1) |
| Later    | Remote operation                                | Authenticated TLS transport and clear host/container networking; no plaintext remote bind                                                                                                                                                                                                                                                                                         |
| Later    | Platform expansion and signing                  | Verified installer/runtime on each target, plus signing/notarization when available                                                                                                                                                                                                                                                                                               |

Tests and code comments are not added during this audit at the owner's request. A later test phase
requires a new owner decision; existing verification scripts can still provide evidence.

## Architecture decisions

Keep React, PixiJS, Electrobun, Bun workspaces and SQLite for the present workload. Adopt focused
libraries where they remove maintained custom logic. [STACK.md](STACK.md) explains when Phaser, Tauri,
a monorepo task cache or a server database would become justified. Do not migrate solely because a tool
has a newer release or the repository has more files.

Historical owner decisions remain useful context: MIT license, default global concurrency two,
24-hour volume retention, unsigned macOS first, one floor per repository, and original sprite
preservation. Provider models and capabilities must be rechecked against current vendor documentation.

The deep audit's own decisions, with the argument and the measurements behind each, are in
[`audit/adr`](../audit/adr): no framework migration (001), keep PixiJS 8 (002), keep the sprite pipeline
and use `sharp` only where it is byte-identical (003), the stack review (004), 43 library candidates of
which two were added and one removed (005), a hand-written command table over a CLI framework (006), and
**no A2A adoption (007)** — the agent-to-agent protocol solves interoperability across trust domains,
which a single-machine daemon that starts every agent itself does not have; the two cases where it could
pay off later are named there, and one of them waits on remote operation.

**Decided by the owner on 2026-09-09**, all three recorded with their measurements: the role-aware effort
defaults **stay** (`high` for worker and reviewer is the vendor's own default, not an escalation — B33.4);
the browser image **is not split** (B24.1); and the **texture atlas is deferred** until the art is complete,
because first paint measures 73 ms with every sprite loaded and 47 furniture keys still have no art
([ADR 003](../audit/adr/003-sprite-pipeline.md)).

## Audit log

- 2026-09-09 — Owner task: the grid system of the map — Prison Architect's mechanics were read from its
  wiki before anything was written (tile as the atom, walls occupying whole cells, rooms as a painted
  designation), and the owner settled the four decisions, the load-bearing one being that **layouts are
  written in code, never built by the player**. A 100×70 map, a `Layout` compiled into four per-cell
  layers with a derived collision mask, an always-visible grid and a zoom/pan camera. Sources, decisions
  and the measured verification in [the grid plan](plans/2026-09-09-grid-system.md).

- 2026-09-09 — Owner task: the office starts again from scratch — All art (306 PNGs, 48 MB), the sprite
  pipeline (`assets/`, the three `assets:*` scripts and their libraries) and the approved layout (rooms,
  furniture, doors, glazing, decor, the plan audit) were deleted at the owner's instruction. A floor is
  now a bare 48×28 walkable plane with named spots and the renderer draws a white surface with one dot
  per character; the movement, needs, reservations and envelope choreography stayed. Evidence and the
  next steps in [the rebuild plan](plans/2026-09-09-office-from-scratch.md).

- 2026-09-09 — Owner task: the add-project dialog and an airier UI — A native directory picker behind
  the folder icon (`system.pickDirectory` with a `DirectoryPicker` port: the desktop app's own open
  panel, `osascript` for a daemon on its own), a separate git-URL input behind a source switch, a
  default-branch select filled from `projects.inspect`, and absolute spacing/text scales with shared
  form primitives across the panels, settings, setup checklist and header. Plan and decisions in
  [the task plan](plans/2026-09-09-add-project-and-ui-spacing.md), evidence in
  [audit/VERIFICATION.md](../audit/VERIFICATION.md).

- 2026-09-08 — Independent audit — Incremental commits cover state/security, simulation/assets,
  lifecycle/delivery, UI/build/CI, provider/Docker repairs, integration fixes and documentation.
  Local static checks, production UI, existing ACP verification, all provider Docker builds,
  isolated browser flows and unsigned desktop packaging were exercised. See
  [the report](history/AUDIT-2026-09.md) for evidence, unverified behavior and remaining limitations.
- 2026-09-08/09 — Deep audit, modernisation and refactor — Seven waves (foundation, hygiene,
  architecture, runtime and protocols, infrastructure, DX and UI, documentation) against every point of
  the owner's brief, one row per point in [`audit/COVERAGE.md`](../audit/COVERAGE.md). Nothing the
  project claimed about itself was taken as given: version and API claims were re-read from primary
  sources with the date recorded, and performance claims were measured rather than argued — which
  withdrew two of the audit's own findings. Verification is the command and its output, in
  [`audit/VERIFICATION.md`](../audit/VERIFICATION.md): full checks and dependency audits after every
  wave, both Docker images built, the compiled binary and the desktop resources assembled, the office
  driven in a real browser, and real Claude Code sessions run end to end in sandboxes.
