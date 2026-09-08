# Progress

Restart-safe state of this audit. Updated at the end of every step.

- **Branch:** `audit/deep-monorepo-audit-2026-09` (from `main` @ `ecd4aa5`)
- **Phase:** 3 (implementation) — Waves 1 and 2 of 7 complete and verified

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

## Next step

Wave 3 — architecture: B1.2 (`@ho/protocol/runner` subpath), B1.3 (`@ho/sim` barrel), B4.1 (projection
indexes), B4.2 (bounded chat), B4.3 (MCP server per call), B9.1, B9.2 (port boundary leaks), B16.1 (`sharp`
for exact raster ops), B16.3 (drop `proper-lockfile`), B22.1, B22.2, B29.1 (`useMutation`), B29.2 (one
socket handshake), B29.3 (intake blocks its own subscription).
