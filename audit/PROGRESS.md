# Progress

Restart-safe state of this audit. Updated at the end of every step.

- **Branch:** `audit/deep-monorepo-audit-2026-09` (from `main` @ `ecd4aa5`)
- **Phase:** 1 (read-only audit) — reading complete, verification complete, writing findings

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

## In progress

- Writing `audit/AUDIT.md`, `audit/COVERAGE.md`, `audit/DEPENDENCIES.md`, `audit/adr/*`.

## Next step

- Finish the four audit documents, then Wave 1.

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

## Next step

Wave 1 — foundation: A1.1 (oxlint overrides), A1.2 (node plugin), A1.3 (nine rules), A1.4 (incremental),
A1.5 (knip apps/cli), A1.7 (trustedDependencies), A1.8 (delete the 62 MB artefact), A4.2/A4.3 (bumps +
root zod), B22.3 (type-fest), A2.2/A2.3 (CI daemon smoke + lockfile drift). Then `bun run check`, builds,
daemon start, UI render — all recorded in `audit/VERIFICATION.md`.
