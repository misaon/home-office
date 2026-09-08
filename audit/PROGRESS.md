# Progress

Restart-safe state of this audit. Updated at the end of every step.

- **Branch:** `audit/deep-monorepo-audit-2026-09` (from `main` @ `ecd4aa5`)
- **Phase:** 0 done → starting Phase 1 (read-only audit)

## Done

- Phase 0 inventory → `audit/INVENTORY.md` (tree, 17 workspaces, every config file, every markdown file,
  both workflows, both Dockerfiles, declared-vs-imported dependency diff, data-flow map).
- Baseline verification → `audit/VERIFICATION.md` (install, check, audit, four builds, daemon start,
  CLI start, UI render confirmed with a screenshot).
- Baseline suppression census → `audit/SUPPRESSIONS.md`.

## In progress

- Phase 1: reading every tracked source file against points A1–A4, B1–B33, C1–C5.

## Next step

- Read `packages/core/src/commands/*`, `packages/daemon/src/*`, `packages/sim/src/*`,
  `packages/ui/src/*`, `apps/*`, `scripts/*` in full; verify every third-party version online;
  write `audit/AUDIT.md`, `audit/COVERAGE.md`, `audit/DEPENDENCIES.md`, `audit/adr/*`.

## Environment notes for a restart

- Scratch daemon home: `/tmp/ho-audit-baseline` (a project "Audit Repo" already exists there).
- The Browser pane is always `document.hidden` → the office ticker stops; see VERIFICATION.md for the
  procedure that works around it.
- `bun run ui:watch` may be left running in the background; it publishes a **development** bundle to
  `packages/ui/dist`. Re-run `bun run ui:build` before any release-shaped check.
