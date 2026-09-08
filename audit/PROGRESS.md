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

## Next step

Wave 6 — DX and UI: B5.1 (the hand-maintained usage string and the 18-arm dispatch, per `adr/006`), B5.2
(raw JSON from every mutating command; `--json` plus a human line, colour through `yoctocolors`), B5.3
(three byte formatters), B5.4 (`stty -echo` left off on Ctrl-C; `@clack/prompts`), B6.3 (bundle splitting or
delete the unused chunk naming), B6.5 (`repoOf` accepts URL schemes the protocol rejects), B13.1 (the
provider state volume called "claude" for every provider), B13.2 (`keychain.ts` names the platform, not the
port).
