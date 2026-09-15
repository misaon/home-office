# Home Office plan

Current status, reviewed 2026-09-09. This roadmap is separate from the
[historical implementation plan and work log](history/INITIAL-PLAN.md). Its historical checkboxes are
not evidence that every original acceptance target was achieved.

## Implemented

- Bun/TypeScript monorepo with a pure domain and simulation, SQLite event log and typed RPC/MCP.
- One repository per project/floor, a boss per floor, receptionist choreography, staff and chat.
- Docker task sessions, git-bridge publication, optional GitHub PR delivery, review and question loops.
- Claude Code plus ACP adapters for OpenCode, Gemini CLI and Codex; provider-specific images and secrets.
- React/Pixi office beside five panels — chat, board, team, usage, settings — and a first-run checklist.
- Electrobun macOS arm64 packaging and unsigned release workflow.
- Optional per-project **task services**: a private rootless container engine per session (rootful as an
  opt-in), so a repository's own `docker-compose.yml` runs inside the sandbox. The scheduler counts such
  a session as two slots, and the session record says whether it got its engine. Every gate is measured,
  including a real Claude Code worker that ran `docker compose up -d` on an unmodified repository and a
  daemon killed while an engine was up; `bun run spike:task-engine` re-runs the lot. Plan and evidence:
  [the plan](plans/2026-09-09-task-service-environments.md).
- Earlier audit repairs: serialized state changes; safe replay failure; bounded channels and runtime
  shutdown; credential/storage/HTTP hardening; task publication ordering; restart reconciliation;
  bounded renderer caches and fixed-step simulation; Sharp image pipeline; shared UI query management;
  pinned desktop/Docker dependencies; stronger lint and CI checks. Recorded in
  [the earlier audit report](history/AUDIT-2026-09.md), kept as history.
- The September 2026 deep audit, seven waves, every finding and its verification in
  [`audit/`](../audit/AUDIT.md): nine stricter lint rules and a CI daemon smoke check that immediately
  caught a compiled binary which could not start; a deduplicated `errorMessage` and 62 spread guards
  replaced by one typed `compact()`; read-model indexes with revision counters instead of per-bump
  rebuilds; one MCP server per request, bound to its session; an image content hash that actually sees its build context; a
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

**Superseded on 2026-09-13** by the architecture pass: the sprite pipeline decision of ADR 003 and the
texture atlas below it describe art that no longer exists, and `sharp`, Drizzle, `type-fest` and the
`@ho/agent-kit` workspace of ADR 004/005 are gone — the event log is plain `bun:sqlite` with a
`PRAGMA user_version` check, and the role skill packs live in `images/agent/plugins`, which is the same
`--plugin-dir` mechanism without a package that contained no code.

**Decided by the owner on 2026-09-09**, all three recorded with their measurements: the role-aware effort
defaults **stay** (`high` for worker and reviewer is the vendor's own default, not an escalation — B33.4);
the browser image **is not split** (B24.1); and the **texture atlas is deferred** until the art is complete,
because first paint measures 73 ms with every sprite loaded and 47 furniture keys still have no art
([ADR 003](../audit/adr/003-sprite-pipeline.md)).

## Audit log

- 2026-09-15 — Owner task: find libraries that would shrink or improve the codebase — The survey
  measured 26 102 lines of first-party TypeScript, largest file 289 lines, and found little commodity
  code left: `sandbox-docker` stays because dockerode drags `@grpc/grpc-js` and `protobufjs` onto a
  229-line `fetch({unix})` client, the runner's line pump stays because `Bun.JSONL` gives neither
  arbitrary text nor its 1 MiB guard, and `Bun.Terminal` turned out to be a pty spawner rather than a
  handle on our own stdin. What it did find was the office's own popovers: no `role="listbox"`, no
  `aria-expanded`, no arrow keys, and Escape over an open select discarding the whole form. The owner's
  answer was to go further than the finding — **Base UI as the single core for every component that has
  a primitive** — plus commander, lucide-react and simple-git, with a free hand on the visuals. Fifteen
  components moved, seven fields of popover state and two invisible scrims stopped existing, and ADR 006
  is reversed rather than contradicted. The screenshots found four real defects the typechecker could
  not, including a scrim that stopped covering the header because a portalled div is not the browser's
  top layer. Cost: +201 KiB on the UI bundle (+10.8 %).
  [The task plan](plans/2026-09-15-library-adoption.md).

- 2026-09-15 — Owner task: audit every npm library and research a more modern alternative — The sweep
  found **nothing deprecated across 210 installed package versions** and nothing abandoned, so the work
  was bumps rather than replacements: eleven catalog pins (Zod 4.6.5, React 19.3.0, oRPC 1.15.1,
  react-i18next 17.0.14, `@types/react` 19.3.0, knip 6.35.1, oxfmt 0.68.0), four in the agent images
  and the Claude Code APK at 2.1.272-r1. `oxfmt` 0.68.0 was checked before adoption because a formatter
  bump can rewrite a tree: it reformats nothing here. The one library removed is `yoctocolors`, whose
  work `styleText` from `node:util` now does — measured identical in all four terminal conditions,
  including inside a compiled binary. Researched and **declined**, each with the figure that decided it:
  Valibot (86 348 → 3 671 bytes on one schema, but Zod sits in nine packages), Paraglide JS (−73 kB
  against ~40 call sites and Czech plural suffixes), LogTape (0.32 M weekly against pino's 36 M, for one
  file), tRPC (oRPC is already the faster and newer of the two), Jotai and TanStack Store (Zustand plus
  TanStack Query is the 2026 pairing), heap-js and `bun-plugin-tailwind`, whose last publish is eleven
  months old. Verification: 28 office states byte-identical, the compiled stylesheet unchanged, all four
  image targets rebuilt and reporting their new versions, and a wrong claim in the previous round's
  record corrected — the `usage-res` state's 43 440 px is the resources panel still loading, not Docker
  disk drift, and it flakes on the baseline too. [The task plan](plans/2026-09-15-dependency-audit.md).

- 2026-09-15 — Owner task: find the most modern linter, deploy it at its strictest, fix everything —
  Three candidates were measured against this repository rather than read about. **Rslint 0.9.2** (Go on
  typescript-go, the newest and at 806 ms the fastest) **panics reproducibly** on this codebase and
  covers 197 of the 385 rules it enforced, so replacing oxlint with it would have dropped 188 — every
  React rule including `rules-of-hooks`, `strict-boolean-expressions`, `switch-exhaustiveness-check`,
  `import/no-cycle`, all 21 `oxc` correctness rules — and made the linting _less_ strict, not more.
  **Biome 2.5.13** has no coherent "strictest" setting: `preset: "all"` turns on Qwik, Solid and React
  rules at once. So oxlint stayed, at 1.83.0, with `style` and `nursery` added and `restriction` left
  off (it bans `async`/`await`, optional chaining and rest/spread). **385 → 554 enforced rules**;
  10 135 findings became 81 after exclusions and all 81 were fixed in the code — named capture groups,
  `(await f()).x` given names, `DomainFailure` → `DomainFailureError`, an import that sat mid-file since
  the drawing port. Thirty-four rules are off with a reason each, two of them because they **deadlock
  with oxfmt** in the same pipeline (measured both directions). `oxlint --fix` broke the build once, by
  rewriting the React `CSSProperties` augmentation into a `Record` that replaces the type instead of
  widening it. **Known gap: oxlint has no CSS rules** — the Tailwind compile in `bun run check` gates
  CSS syntax, nothing gates CSS lint quality, and closing that needs a second tool the owner chose not
  to add. 27 of 28 shot states byte-identical, the 28th proven to be Docker's disk figures drifting.
  [The task plan](plans/2026-09-15-strict-linting.md).

- 2026-09-15 — Owner task: a second, more thorough round of simplification — The first round looked for
  repeated text; this one looked for state the office keeps and never reads, and work it redoes every
  render. Four fields were dead: `openIntake` and `openServices` had no reference anywhere,
  `attachOpen` was cleared in four places and **never set to true**, and `lastError` was written twice
  by `office/scene.ts` and read by nobody — which meant an office whose canvas failed looked exactly
  like an office with nothing on the floor. That one is now a toast, said once however many frames
  throw (measured: 59 throwing frames, one message). `attachOpen`/`usageOpen`/`openSelect` were three
  fields holding one fact with the invariant maintained by hand in four places, and are one `popover`;
  `set` and `update` wrapped the identical zustand call, so `update` is gone. `useFloor()` dressed every
  floor — team, cards and messages — to return one, on every store change, for eight components; it
  dresses one. Three copies of "is this colleague in a session" became `activeSessionOf`, the two floor
  orderings became one, and `retention.idleStopMinutes` — a configuration knob with a default that no
  code read — is out of `DaemonConfig` by the owner's decision. Deliberately not done: removing the
  write-only `Session.sandboxId` and `MailItem.receivedAt` (they are the event log's record, not code
  nobody calls) and giving the UI snapshot the read model's indexes (more machinery than it removes).
  All 28 shot states byte-identical to the previous build. Plan, measurements and the two things the
  survey itself got wrong: [the task plan](plans/2026-09-15-second-simplification-round.md).

- 2026-09-15 — Owner task: simplify and modernise the whole monorepo — Measured first: over the 278
  TypeScript files the repository owns there is no `any`, seven commented type assertions, no
  `forwardRef`/`useMemo`/`useCallback`, `Promise.withResolvers` at all seven sites and
  `AsyncDisposableStack` at all four, so there was no modernisation backlog to work through. What a
  duplicate-block scan did find was nine groups, and those were the task. In the core, nineteen
  commands opened with the same four lines of "fetch it, check for undefined, return `notFound`";
  `withProject`/`withAgent`/`withTask`/`withSession` write that rule once, and `removeProject` stopped
  carrying a copy of `removeTask`. In the UI, four files each had their own `<dialog>`, two files had
  the same pick card down to the tick, two had the same filter chip and two the same attachment fetch:
  `Modal`, `PickCard`, `FilterChips`, `useAttachmentUrl` and `icons.tsx`. The confirm dialog's six
  contradictory backdrop classes became the three it was written with, which moves its backdrop fade
  from 280 ms to 240 ms — the only visible change, and the owner's call. Verification turned up two
  things the plan had not predicted: a production build that **drops a class constant** in a `.tsx`
  module with no imports (`Bun.build` with `minify` and `reactCompiler`, Bun 1.4.2 — it cost a whole
  component's layout and no check in the repository can see it), and 642 bytes of stylesheet nothing
  selects. Both are recorded in [docs/STACK.md](STACK.md), the second also as
  [suppression 11](../audit/SUPPRESSIONS.md). Deliberately not done and left as the owner's decision:
  removing the `reviewer` and `clerk` roles, which is removing a feature rather than removing rot.
  26 of the 28 shot states are byte-identical to the previous build, the other two proven to be data
  drift by shooting the baseline against itself. Plan, measurements and the process note about a failed
  daemon restart that nearly produced a false result:
  [the task plan](plans/2026-09-15-consolidate-duplication.md).

- 2026-09-15 — Owner question: why two answers, and why does the model not answer at all — A failed
  triage said the same sentence twice: `settle` posted the runtime's own text as the boss's reply, then
  filed it as the reason the task blocked, and the boss reads that reason out. The event log shows both
  writes back to back (`chat.message_posted`, then `task.status_changed` to blocked with the same text,
  then `chat.message_posted` again). The boss's line is the one that belongs in a chat, so the raw text
  is no longer posted when he is about to read it out. The 401 itself is not the office's doing: the
  sandbox receives exactly one credential (`CLAUDE_CODE_OAUTH_TOKEN`, trimmed by both the CLI and the
  UI, with no host environment inherited), so Anthropic is rejecting the token. The checklist could
  never have caught that — `doctor.secrets.anthropicOauthToken` is a presence check — and the step that
  did try the token end to end was the smoke test, removed earlier the same day. The step now says what
  it verifies rather than implying the token works.

- 2026-09-15 — Owner task: seven things the office got wrong — A focus ring the browser drew inside the
  border the office already draws (the drawing's global `:focus` reset had not survived the Tailwind
  rewrite), the platform's light scrollbar on twelve of the thirteen surfaces that scroll (the same
  rewrite made that rule opt-in and opted one in), a "Open full usage" button no click could reach, a
  first-run step removed, the hire dialog cut to the roles this office hires here, dialogs that close
  when the click lands beside them, and Lola at the reception given the pill every other character
  wears. The unreachable button was two stacking contexts deep: `main` carried a z-index, and the
  panel's entrance animation held `transform: none` as an identity matrix — both founding contexts that
  capped the popover under the sheet meant to dismiss it. Both predate the rewrite. Verified in a
  browser and held against the previous build over 28 states: only the four screens that were meant to
  change did. An eighth followed: the task sheet drew "Move to done" and "Hand back" whatever state the
  task was in, and `done` is reachable from `in_progress` and `review` alone — so on most tasks the
  office answered the click with a rejection it had already decided. The sheet now draws the edges the
  state machine actually has, and says why when it has none.

- 2026-09-14 — Owner task: the whole design rewritten in Tailwind 4 — 594 inline style objects and 166
  style constants across 71 files became utility classes, and `design.css` (427 lines of reset, keyframes
  and thirty-six `!important` hover rules) was deleted. `packages/ui/src/design/app.css` is now the only
  stylesheet: Tailwind, the fonts, four `@source` globs, one `@theme` holding the palette, type scale,
  radii, shadows, easings and thirty animations, and three `@utility` blocks. Thirteen `style` attributes
  remain and each sets only a custom property a utility reads back. Held to the pixel against the previous
  build three ways over 28 states — every pixel of the viewport with animations disabled and the canvas
  hidden, every painting property of every element including `::before`/`::after`/`::placeholder`, and a
  scan for classes fighting over one property. That found five defects screenshots alone could not: a
  field with no border colour, two transitions that could not animate Tailwind's `translate`/`rotate`
  properties, a button whose lit state was always overridden, and a harness step that had never opened
  the screen it claimed to test. Decisions and measurements in
  [the task plan](plans/2026-09-14-tailwind-rewrite.md) and [docs/STACK.md](STACK.md).

- 2026-09-13 — Owner task: redesign the whole UI, with animation, and make it obvious — The right rail
  had six tabs and the floor's people lived in two of them, one to watch and another to edit; it has
  five, and Team is one card per colleague with their state on the front and their model, effort and
  persona one click deeper. Usage absorbed Resources, because both answer what the office costs. Every
  setting that is on or off is a switch with its consequence written beside it, not a checkbox to guess
  at. Motion became a token like a colour: three durations, two easings, an overshoot reserved for
  things that arrive, and `prefers-reduced-motion` that keeps the fades and drops the movement. Looking
  at it in the browser is what found the rest — a chat that scrolled through its own history on open, an
  image that resized its bubble when the bytes landed, native controls still drawn light on dark panels,
  and a prune button that shouted while its consequence hid in a tooltip. Decisions, the five
  corrections and the verification are in [the plan](plans/2026-09-13-ui-redesign.md).

- 2026-09-13 — Owner task: attachments in the chat, and showing that the boss is thinking — A message
  can carry files in both directions: the human drags them into the chat, the boss writes his into the
  session's outbox and names them in `ho_reply`. Bytes live beside the log under the office's state
  directory, named by their own SHA-256, so a replay stays cheap and a repeated upload costs nothing;
  the event carries only the descriptor. Each session gets the task's files read-only at `/in/chat` and
  a writable `/out/chat`, the two ways a file crosses the sandbox wall. An image in the chat opens in a
  viewer that zooms around the pointer and pans, like the office map. While the boss works on the floor,
  the chat shows it, with the tool he is using. Decisions and what was left out are in
  [the plan](plans/2026-09-13-chat-attachments.md).

- 2026-09-13 — Owner task: a full pass over the monorepo for architecture and complexity — Two
  independent audit waves over every file, then the repairs. The office's own read model, its envelope
  bookkeeping and the daemon's lifecycle were the load-bearing changes: a wall under a window stays
  solid, an envelope is reported exactly once per walk (and reported at all when its carrier leaves or
  the connection drops), sessions end before their sockets do, and a resumed ACP session announces
  itself. The event log lost its ORM, the skill packs their empty workspace, the CLI its duplicated
  dispatch, and `@ho/core`/`@ho/sim`/`@ho/protocol` the exports nobody imported. Details and the
  measurements are in [the plan](plans/2026-09-13-architecture-pass.md).

- 2026-09-10 — Owner task: footprints, an outline around furniture, and two languages — Seven pieces
  resized in `OBJECT_SPEC` (meeting and dining table 7×3, fridge 3×2, hot tub 5×5, bookcase 8×1, toilet
  2×2, window 4×1), and ARCHITECTURE's stale copy of those numbers corrected to match the table it
  should have been reading. Furniture is now inset and outlined at the weight rooms use, which is what
  stops two desks that share a cell edge from reading as one: the old stroke was a world-unit hairline
  that vanishes at the zoom a whole floor is seen at. The office also speaks Czech — chosen in Settings,
  remembered in the browser, every panel, tooltip and the editor's own palette included, with room and
  furniture names in the dictionaries while the office file keeps its slugs. Everything an agent reads
  stays English. Decisions, the measurement and what the library cost are in
  [the plan](plans/2026-09-10-footprints-borders-and-language.md).

- 2026-09-09 — Owner task: `docker compose` inside a task — Eleven candidates were read from primary
  sources first (Docker Sandboxes `sbx` 0.42.1, rootful and rootless dind, sysbox, gVisor, rootless
  Podman, Apple `container` 1.0, Docker Offload, socket proxies, Dev Containers, Dagger container-use),
  and the load-bearing behaviour was measured on this machine before anything was written. Chosen: a
  private rootless dind engine per session, joined to the sandbox's network namespace, with the task
  volume at the same path in both — which is what makes an unmodified Compose file work. Rejected:
  running the repository's Compose file on the daemon's own engine, because a Compose file is a
  privilege request (`privileged`, `network_mode: host`, absolute binds) and its relative bind mounts
  would resolve on the wrong filesystem. Two of this plan's own instructions were corrected by
  measurement, both recorded beside the original claim. Decisions, survey and evidence in
  [the plan](plans/2026-09-09-task-service-environments.md).

- 2026-09-10 — Owner task: closing the service-environment gates — All seven verification gates are now
  measured. The last two needed a real daemon on a scratch state directory: a Claude Code worker ran the
  repository's Compose file unchanged and verified postgres on `127.0.0.1:15432` itself, and a `kill -9`
  while an engine was up left orphans that the restart removed while GC collected their socket volumes.
  Added along the way: `Session.services` so the inspector, the CLI and the history say whether a session
  had its engine; `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE`, without which Ryuk would look for a socket the
  engine does not have (a real Testcontainers run now proves both variables); and `spikes/task-engine`,
  the harness behind `bun run spike:task-engine`.

- 2026-09-09 — Owner task: the internal office editor — A development-only editor (walls, rooms, doors,
  eraser) that saves `layouts/<id>.json` through a daemon store, with the JSON keeping semantic ids so
  art added later applies to offices drawn now. The production bundle is stubbed at build time and
  verified by grepping it. Decisions and the measured round trip in
  [the editor plan](plans/2026-09-09-layout-editor.md).

- 2026-09-09 — Owner task: the grid system of the map — Prison Architect's mechanics were read from its
  wiki before anything was written (tile as the atom, walls occupying whole cells, rooms as a painted
  designation), and the owner settled the decisions, the load-bearing one being that **layouts are
  written in code, never built by the player**. The map is the office at a fixed 60×34 cells — wider
  than any pane, so the width always sets the fit and the sides are flush — compiled from a `Layout` into four per-cell layers with a
  derived collision mask, under an always-visible grid and a camera that zooms in to 64 px per cell and
  cannot be pulled back past the whole floor. Sources, decisions
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
