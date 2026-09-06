# Home Office — instructions for AI agents working in this repository

Home Office (HO) is a Bun + TypeScript 7 monorepo: a daemon that runs AI coding agents in isolated Docker
containers, and an Electrobun desktop app that renders them as a pixel-art office. Read these before coding:

1. `docs/PLAN.md` — phases, tasks, acceptance criteria, **Log** (append when you finish a task).
2. `docs/ARCHITECTURE.md` — topology, ports/adapters, protocols, simulation, security, token economy.
3. `docs/STACK.md` — chosen technologies with verified versions; do not add dependencies outside it without
   recording the decision there.
4. `docs/CONVENTIONS.md` — strict TypeScript, oxlint, formatting, error handling, security and git rules.

## Commands

- `bun install` — install (isolated linker, exact versions, `catalog:` protocol for all versions).
- `bun run check` — typecheck (TypeScript 7 native `tsc`), `oxlint --type-aware`, `oxfmt --check`, `knip`.
  Must pass before every commit; `bun run setup` installs the git hook that enforces it.
- `bun run fmt` — format everything with oxfmt.
- `bun run ui:watch` — rebuild the office UI on change (the page reloads itself); `bun run assets:manifest` after adding sprites.
- `bun run desktop:dev` / `bun run desktop:build` — Electrobun app via Hutch (`apps/desktop`; resources assembled by `bun run desktop:prepare`).

## Layout

`apps/*` (desktop, cli) · `packages/*` (protocol, core, store, daemon, sandbox-docker, runtime-claude-code,
runtime-acp, intake-github, sim, ui, secrets, agent-kit, …) · `images/*` (Dockerfiles) · `spikes/*` (verification harnesses) ·
`assets/` (approved reference + sprites) · `docs/` (incl. `OFFICE-ART.md` for the office plan and sprite keys). Package scope is `@ho/*`; sources are executed as TypeScript, no build step except release
binaries and the webview bundle.

## Rules that matter most

- Pure core: `packages/core` and `packages/sim` have no I/O and no Bun/DOM globals. Side effects live in
  adapter packages behind the interfaces defined in core.
- Event-sourced: state changes are events appended to the store; projections are derived.
- Validate every boundary with Zod; never let agent output become a shell command in the daemon.
- Secrets never appear in images, container config, labels, logs, events, or this conversation.
- No tests until Phase 8 (owner decision); still design for testability.
- Verify external facts (CLI flags, APIs, versions) online instead of guessing.

## Working loop

Pick one task from `docs/PLAN.md`, state assumptions, implement, run `bun run check`, append a Log entry
(`- YYYY-MM-DD — <task id> — <outcome> — <follow-ups>`), commit with a Conventional Commits message.
