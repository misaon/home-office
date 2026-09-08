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
