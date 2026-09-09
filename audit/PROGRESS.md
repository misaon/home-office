# Progress

Restart-safe state of this audit. Updated at the end of every step.

- **Branch:** `audit/deep-monorepo-audit-2026-09` (from `main` @ `ecd4aa5`)
- **Phase:** 3 (implementation) — Waves 1–5 of 7 complete and verified

## Done

- Phase 0 inventory → `audit/INVENTORY.md`; baseline verification → `audit/VERIFICATION.md`;
  suppression census → `audit/SUPPRESSIONS.md`. Commit `ac30a34`.
- Read **every** tracked `.ts`/`.tsx`/`.css`/`.html` file (200 files, 20 121 lines) plus every config,
  workflow, Dockerfile and manifest.
- Online verification pass, all against sources opened in this session:
  - npm registry sweep of all 35 declared dependencies + 43 candidate libraries (versions, deprecation,
    last-publish dates, weekly downloads, licences, transitive dep counts).
  - GitHub API health check of `mourner/tinyqueue`, `moxystudio/node-proper-lockfile`,
    `blackboardsh/electrobun`, `rtk-ai/rtk`, `oxc-project/oxc`, `pixijs/pixijs`.
  - Claude Code CLI reference, settings reference and env-var reference (flags, deprecated settings keys).
  - Claude model catalogue via the bundled `claude-api` skill.
  - Bun `secrets` docs; Node `parseArgs` `multiple` (also proved empirically in Bun 1.4.2).
  - oxlint 1.82.0 configuration schema (`overrides` support, 870 rules, 7 categories).
  - TypeScript 7.0.2 `--build` / composite behaviour, proved empirically (TS6310, TS5102).
  - The installed `@agentclientprotocol/sdk@1.4.0` type surface (v1 vs `experimental/v2`).
  - Docker Engine API levels and the pinned Alpine digest (verified against `/etc/alpine-release`).

## Environment notes for a restart

- Scratch daemon home `/tmp/ho-audit-baseline` holds a project "Audit Repo"; a daemon may be listening on
  127.0.0.1:47800 (`ho ui --print` gives the tokened URL).
- `bun run ui:watch` may be running and has published a **development** UI bundle to `packages/ui/dist`.
- The Browser pane is always `document.hidden`; see VERIFICATION.md for the ticker workaround.
- Careful: `bun run assets:placeholders` **overwrites tracked sprite PNGs** under
  `assets/src/characters/*`. Never run it in this audit.
- `bunx tsc` resolves a stale global TypeScript 5.9.3 on this machine; the repo's own tsc is 7.0.2
  (`./node_modules/.bin/tsc`). Do not report that as a repo defect.

## Phase 2 complete (2026-09-08)

Six ADRs written under `audit/adr/`: 001 framework migration (no), 002 render engine (keep PixiJS 8),
003 sprite pipeline (keep, move exact ops to sharp, add atlas), 004 stack review, 005 library candidates,
006 CLI framework (declarative table, no framework). `audit/COVERAGE.md` written with all 42 rows at
ROZHODNUTO (A3 at AUDITOVÁNO) and no N/A rows. **No source code changed yet.**

Nothing in the recommendations is irreversible or rewrites >15 % of the code, so under §5 no approval is
required before Wave 1. Two items are flagged for the owner's attention when implemented rather than
blocked on: the effort defaults (B33.4, a cost change) and the optional browser/chromium image split
(B24.1b, ~900 MB off the agent image but a build-graph change).

## Wave 1 complete (2026-09-08) — verified

**Config:** oxlint `overrides` (four whole-file disables gone) + the `node` plugin + nine rules;
`incremental` typecheck with a per-workspace `tsBuildInfoFile` (9.86 s → 3.33 s user CPU warm); knip now
covers `apps/cli`; `trustedDependencies`; a 62 MB stray build artefact deleted; `@types/bun` 1.4.2,
`knip` 6.35.0, root `zod`, `type-fest` in `@ho/protocol`.

**Code:** `titleFromText` moved to `commands/shared.ts`, which breaks a real import cycle
(**new finding B1.4**); four type-only re-exports marked `export type *`; five inferred return types
annotated; the four hand-written sidecar guards in `scripts/lib/import-target.ts` replaced by a Zod schema
(B16.2); and **the blocker A2.5 fixed** — migrations are now embedded via import attributes, so the
compiled `ho` binary can start the daemon, which it could not do at baseline.

**CI:** a daemon `/health` smoke test that also asserts `daemon.json` is mode 600, and an `npm ls`
lockfile-drift guard before each sandbox `npm audit`.

`bun run check` green; builds, the compiled daemon and the office render all verified — see
`audit/VERIFICATION.md`. Two audit claims were corrected in `audit/AUDIT.md`: A1.3 ("already satisfied" —
wrong, three rules had 36 hits) and the Phase 1 miss of B1.4 and A2.5.

## Wave 2 complete (2026-09-08) — verified

**Deduplication:** `compact()` and `errorMessage()` now live in `@ho/protocol`, the one package every
workspace already imports; they replace **63** `exactOptionalPropertyTypes` spread guards (AUDIT.md said 62;
one was written across three lines) and **24** copies of the unknown-error idiom under five names.
`definedOnly` is gone with them (B1.1). Four CLI flag parses became `Schema.optional().parse(flag)`, because
`compact` evaluates eagerly and the old guards were hiding `AuthKind.parse(undefined)` and `Number(undefined)`.

**Naming and dead surface:** one version from `HO_RELEASE_VERSION` for the daemon, the MCP server and the
ACP `clientInfo` (B13.5, verified end to end); `ChatHistoryInput`/`UsageBucket` export their types;
`McpAgentSummary`, the `"daemon-token"` secret key and the unread `images` capability deleted; the previous
audit's report moved to `docs/history/` with a provenance banner and its five links repointed.

**Simplification:** `parseArgs` `multiple: true` replaced the hand-written `--import` scanner (verified: two
`--import` flags both land), `walkSteps` lost two unused parameters at twelve call sites, three dead lines
gone, the boss's "done" line is built in one place, and the runner's stream pumps are shared with the ACP
spike (which had dropped the 1 MiB guard).

**Found while verifying, all recorded in `AUDIT.md`:** **A2.6** (a self-compiled `ho` serves 404 for the UI
and 500 for `doctor` — resources resolve to `/`; scheduled for Wave 5), **B6.6** (a hidden document silences
every UI update because the rAF-coalesced bump never fires and its flag stays set — fixed), **B29.5**
(unexpected RPC failures were logged nowhere — fixed, and it immediately exposed A2.6's cause), plus the
Wave-1 CI guard that would have failed every run (A2.3, fixed here).

Full §7 pass, including the Docker image build deferred from Wave 1: `bun install --frozen-lockfile`,
`bun run check`, both audits, all four builds, `ho image build` through the daemon, the runner binary run
inside the image, the CLI exercised command by command, and the office rendered in the always-hidden
browser pane **without console hacks** — output in `audit/VERIFICATION.md`.

## Wave 3 complete (2026-09-09) — verified

**Projection:** `applyEvent` maintains six indexes (agents and tasks by floor, sessions by task and by
agent, active sessions, mail by its source triple) and the helpers callers already used read them; eleven
scan sites became lookups. `usage.summary` no longer reads the whole `session.state_changed` history from
SQLite — the projection keeps the rate-limit times — so the RPC context does not take the event store at
all. Chat is a bounded per-floor tail instead of one unbounded array copied every frame.

**Boundaries:** URL encoding moved inside the Docker adapter, `SecretStore` is typed over the real
`SecretKeyName` enumeration, the mailbox animation goes through the floor's animation channel instead of
writing into layout data, the runner wire protocol lives behind `@ho/protocol/runner`, and the `@ho/sim`
barrel lists only what consumers use.

**Dependencies:** `proper-lockfile` is gone (5 packages) — a `mkdir` directory lock with a pid liveness
check for the two single-instance cases, an in-process promise chain for mirror refresh.

**UI:** every write goes through `useMutation`, the two hand-rolled refresh loops became real queries, and
the ten components no longer each re-implement pending/error state.

**Found while verifying:** **B24.3** — the image content hash matched _no_ files from the build context
(Bun's `Glob` returns nothing for a brace group crossing a path separator), so editing a Dockerfile never
rebuilt the image and `doctor` said "up to date"; fixed and verified in both directions. **B5.5** — a failed
build reached the CLI as "Internal server error"; now it reports the build's own message and exits 1.
**B16.1 withdrawn** after measuring sharp against our raster ops byte for byte.

Two real Claude Code sessions ran in sandboxes against the changed core (17 and 4 turns), the boss replied in
chat, the usage summary aggregated them from the projection, and the office rendered it all — output in
`audit/VERIFICATION.md`.

## Wave 4 complete (2026-09-09) — verified

**Simulation:** the occupancy set is built at most once per tick instead of once per query — measured in
isolation at 2.7× (8 walkers), 9.8× (30) and 16× (60), and O(N) instead of O(N²). The five copies of the
four-neighbour table are one, `adjacentFree` and `besides` are one function, the blocked-walker jitter is
hashed at spawn, `nearestWalkable` returns the nearest cell instead of a square's top-left corner, and
`removeActor` drops its own three anchors instead of sweeping every reservation on every floor.

**Daemon:** the scheduler's 2 s heartbeat is gone (verified live: a session starts the moment the assign
event arrives) and a single retry covers the case the heartbeat existed for; the office gate keeps a bounded
tail of envelopes; the event store no longer filters twice.

**Protocols:** ACP's `usage_update` is no longer dropped — a first-class `context` runtime event carries
context fill and cumulative cost, deliberately not folded into the token counters, and the Usage panel says
so; `PROTOCOL_VERSION` comes from the SDK; the replay-boundary event now reaches the simulation bridge.

**UI:** the snapshot copies only the collection an event touched (verified live: a task event copied `tasks`
and every other collection kept its identity) and panels select the collections they use.

**Intake:** no empty `labels=` in the GitHub query, and the duplicate check uses the mail index.

A real Claude Code session ran again end to end (6 turns) with no errors in the log — output in
`audit/VERIFICATION.md`.

## Wave 5 complete (2026-09-09) — verified

**Security:** constant-time token comparison (`Bun.timingSafeEqual` does not exist in Bun 1.4.2 — the
audit's own recommendation was wrong; `node:crypto` has it), `ho.db` and its WAL/shm files at 0600 with the
state directory's 0700 re-asserted at every start, volume names encoded into Engine API paths, and the
sandboxes' unrestricted egress written down as an accepted risk in `ARCHITECTURE.md` with what limits it.

**The compiled binary:** it now says what it cannot do instead of returning 404 and "Internal server error"
— `serves: { ui, images }` in `daemon.json`, a refusal from `ho ui` and `ho image build`, a doctor line
saying images are not inspectable. Chasing that also found **A2.7**: a Keychain read from a compiled binary
blocks forever (30 ms from source, still hanging after 15 s compiled), so secret reads are bounded at 5 s
with a message naming the cause.

**Images:** the runner is a 117 730-byte bundle on the image's own Bun instead of a 74 517 712-byte compiled
binary — `ho/agent:dev` 1.76 → 1.69 GB — verified by a real session through the bundled runner. CI now
builds and smoke-tests both images on a free arm64 runner, and both workflows cache the pinned Hutch
toolchain instead of fetching it from a vendor host on every run.

**Toolchain:** `bun run check` also builds the UI, so the pre-commit hook and CI check the same things; the
desktop app got two strictness flags back (measured: they were off for nothing).

**AI configuration:** the deprecated `includeCoAuthoredBy` replaced by `attribution`, the vendor's git
instructions turned off (the office has its own and forbids pushing), dead `autoUpdatesChannel` removed,
`bashOutputMaxChars: 10 000`, `fable` added to the catalogue, and effort defaults by role — worker and
reviewer `high`, boss `medium`, clerk `low` — which also removed the last CLI/UI divergence in agent
defaults. Every claim re-read from the live documentation today before changing anything.

**Deliberately not done:** B24.1(b), the ~900 MB browser/chromium image split. `browser.enabled` defaults
to true, so the saving only reaches installations that turn the browser off, and the change doubles the
image matrix and alters what a first run downloads — an owner-facing decision, recorded in `AUDIT.md` with
the plan.

**For the owner:** the effort defaults are a cost change (B33.4), and B24.1(b) is waiting on a decision.

## Wave 6 complete (2026-09-09) — verified

**The CLI stopped drifting from itself.** `apps/cli/src/command.ts` defines one `Command` descriptor,
`commands/table.ts` holds all 17 of them, `help.ts` walks that table instead of restating it, and `run.ts`
is 19 lines instead of an 84-line switch. Mutating commands print a human sentence and take a global
`--json`; `doctor` and `resources` print their whole report under the same flag. One `formatBytes` in
`@ho/protocol` replaced three formatters with three different units, so the CLI and the panel finally agree
(`1.2 GiB`).

**Two of my own findings did not survive measurement, and both are recorded as withdrawn.** B5.4 claimed
Ctrl-C at the hidden secret prompt leaves the shell with echo off; under a pty, Bun restores the terminal's
termios from both `atexit` and its own `SIGINT` handler (its source says so, and a plain `sh` control does
leak), so the handler I had written was deleted before it was committed and `@clack/prompts` is not
adopted — one dependency fewer than ADR 005 first concluded. B6.3 claimed the build config declares a
`chunk` pattern nothing produces; removing it renames the bundle to `chunk-<hash>.js`, so it is exactly
what names an HTML entrypoint's output. Splitting PixiJS out was measured too: the office canvas is the
first view, so a `React.lazy` boundary would delay the primary view, not the panels.

**Three findings the wave itself produced.** B5.6: every bad argument printed the JSON issue array a Zod 4
`ZodError` carries as its message, and an oRPC rejection printed only "Input validation failed" — both now
render from their issues. B6.7: a tab whose token the daemon rejects reconnected every two seconds forever,
because a browser cannot see the status of a failed websocket handshake; it now asks `GET /health` once,
says "No daemon token" and waits for a fresh launch URL. B21.4: that loop wrote 393 warn lines into the
daemon log during this wave's own checks, which exposed a log file with no size bound at all — it now keeps
one previous file and rotates at 8 MiB, without a dependency (`pino-roll` was rejected: 11 months quiet,
and it pulls in `date-fns`).

**Naming that lied.** Provider state volumes were `…-claude-…` with `ho.kind: claude-config` for every
provider, including the ones whose state directory is `.gemini` or `.codex`; they are now `…-state-…` with
`ho.kind: provider-state`, and the collector still prunes the old label so nothing leaks on the owner's
Docker. `keychain.ts` is `os-credential-store.ts`: `Bun.secrets` is Keychain, libsecret and Credential
Manager, so `auto` no longer downgrades Linux and Windows by platform — it uses the OS store if it answers
and the 0600 file if there is none (proved both ways: macOS host, and `oven/bun:1.4.2-alpine` reporting
"libsecret not available"). A timeout is deliberately _not_ a fallback: that is the Keychain waiting for
the user, and answering it with a different store would be worse. And ACP sessions reported tool calls as
"turns" — one prompt is one turn now, which is the protocol's own definition.

**For the owner:** nothing new to decide in this wave. Still open from Wave 5: the effort defaults are a
cost change (B33.4), and B24.1(b) (the ~900 MB browser image split) waits on a decision.

## Wave 7 complete (2026-09-09) — verified, and the audit is done

**The documentation now describes the code that exists.** Six files changed. What they used to say and no
longer do: that a _compiled_ `ho-runner` connects to the gateway (it is a Bun bundle on the image's own
Bun), that startup holds a `proper-lockfile` lock (an atomic `mkdir` plus a pid liveness check), that
provider state lives in `claude-config` volumes (`provider-state`, with the old label still pruned), that
ACP `turns` is "an approximation from tool calls" (one prompt, one turn — and the two providers' numbers
still mean different things, which the document now says out loud), that secrets are a macOS Keychain
story (Keychain, libsecret or Credential Manager, chosen by whether the host store answers), and that a
hidden office simply stops (it draws a still frame, and the store coalesces on a 200 ms timeout because a
hidden document never runs a rAF callback). `README.md` now warns that a self-compiled `ho` carries no UI
bundle and no image contexts, `docs/CONVENTIONS.md` lists the eight lint rules that actually change how
code gets written, and `docs/OFFICE-ART.md` names `assets/README.md` as the load-bearing sprite contract
together with the three files that implement it (A3.3).

**Every number in those documents was re-read in the source** — the live-log caps, the chat tail, the
handshake timeout, the termination ladder, the floor-view cache, `maxFPS`, the compiler-project count, the
mirror path, the task-branch prefix — and the image was asked for its own versions (`rtk 0.48.0`,
`claude 2.1.263`, `bun 1.4.2`, `node v24.18.1`). The transcript is in `audit/VERIFICATION.md`.

**The wave also caught the audit lying about itself.** `DEPENDENCIES.md` listed
`chrome-devtools-mcp` 1.8.0 → 1.9.0 as bumped in Wave 5, but the sandbox manifest still pinned 1.8.0. The
bump is applied now — lockfile regenerated, `npm audit` clean, agent image rebuilt (the rebuild was itself
a re-test of B24.3: the content hash noticed) — and the record says what happened.

**The coverage matrix is closed.** Every row reads `OVĚŘENO`; none is `N/A`, because every point in
A1–A4, B1–B33 and C1–C5 turned out to apply to this repository. Where a recommendation was deliberately
not implemented, the row says so instead of claiming otherwise: the ~900 MB browser image split (B24.1(b))
and the texture atlas (ADR 003) are both owner decisions with their plans recorded.

**For the owner, once more:** worker and reviewer sessions now default to `high` effort, which costs more
per session (B33.4); the browser image split and the atlas are waiting on a yes or no.

## The audit is complete (2026-09-09)

Seven waves, one commit per point group — [pull request #5](https://github.com/misaon/home-office/pull/5) lists them, and its own description carries the diff counted at the commit it names. The coverage
matrix is closed: **42 rows, every one `OVĚŘENO`, none `N/A`** — every point of the brief turned out to
apply to this repository.

The last row was A2, and it could only be closed by GitHub: run 34329322345 on this pull request built
both Docker images on a free arm64 runner (5 m 58 s) and ran the daemon smoke check (40 s), both green,
with the transcript in `VERIFICATION.md`. Everything else in that file was measured locally.

**What is not done, deliberately, and why** — each recorded beside its finding rather than quietly
dropped: the browser image split (B24.1(b)), the texture atlas (ADR 003), tests (out of scope by
instruction), and the two recommendations measurement withdrew (B5.4, B16.1).

## The owner's decisions, 2026-09-09

All three open points closed, and two of them changed something in the record:

- **Effort defaults stay.** Reading the live vendor documentation for this decision corrected the audit's
  own framing: `high` is "the default on every model except Opus 4.7", so Wave 5 moved workers and
  reviewers _up to_ the vendor default rather than above it. On a subscription this consumes usage limits
  faster rather than producing a bill; the per-task levers remain `maxTurnsPerTask` and concurrency
  (B33.4).
- **The agent image is not split.** Measured for the decision, the browser costs **~1.06 GB** of the
  1.69 GB image — more than the finding's ~900 MB guess — but it is stored once for all four provider
  targets, `browser.enabled` defaults to true, and `chromium-headless-shell` would save only ~150 MB. A
  third option (a browser sidecar reached over `--cdp-endpoint` / `--browser-url`) is recorded with the
  reason it was declined: it must share the session's network namespace to see the agent's own dev server
  (B24.1).
- **The texture atlas is deferred** until the art is complete: first paint measures 73 ms with all ~230
  sprites loaded, Pixi's 16-texture batch limit only bites at thousands of sprites, and 47 furniture keys
  still have no art at all (ADR 003).

And one question the owner asked afterwards, answered in [ADR 007](adr/007-a2a-protocol.md): **A2A is not
adopted.** It solves agent-to-agent interoperability across trust domains, which a single-machine daemon
that starts every agent itself does not have; the providers HO runs reach A2A only through third-party MCP
bridges; and the one genuinely attractive case — an outside orchestrator delegating work to a floor — is
blocked on the authenticated remote transport the roadmap defers.
