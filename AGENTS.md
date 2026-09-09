# Home Office — instructions for AI agents working in this repository

Home Office (HO) is a Bun + TypeScript 7 monorepo: a daemon that runs AI coding agents in isolated Docker
containers, and an Electrobun desktop app that renders them as a pixel-art office. Read these before coding:

1. `docs/PLAN.md` — current status and remaining work; historical plans live under `docs/history`.
2. `docs/ARCHITECTURE.md` — topology, ports/adapters, protocols, simulation, security, token economy.
3. `docs/STACK.md` — chosen technologies with verified versions; do not add dependencies outside it without
   recording the decision there.
4. `docs/CONVENTIONS.md` — strict TypeScript, oxlint, formatting, error handling, security and git rules.
5. `audit/` — the September 2026 audit: `AUDIT.md` (every finding, including the ones measurement
   withdrew), `COVERAGE.md` (one row per audited point), `VERIFICATION.md` (the commands and their real
   output), `SUPPRESSIONS.md` and `adr/001`–`007` for the decisions that needed an argument.

## Commands

- `bun install --frozen-lockfile` — install locked workspaces (isolated linker, catalog pins).
- `bun run devkit` — verify/install the pinned desktop toolchain before standalone checks.
- `bun run check` — typecheck (TypeScript 7 native `tsc`, 16 projects), `oxlint --type-aware
--deny-warnings`, `oxfmt --check`, `knip`, and the office UI build. Must pass before every commit;
  `bun run setup` installs the git hook that enforces it.
- `bun run fmt` — format everything with oxfmt.
- `bun run ui:watch` — rebuild the office UI on change (the page reloads itself). The internal office
  editor exists only in this build: open it from the header or with `?editor=1`.
- `bun run desktop:dev` / `bun run desktop:build` — Electrobun app via Hutch (`apps/desktop`; resources assembled by `bun run desktop:prepare`).

## Layout

`apps/*` (desktop, cli) · `packages/*` (protocol, core, store, daemon, sandbox-docker, runner,
runtime-claude-code, runtime-acp, intake-github, sim, ui, secrets, agent-kit) · `images/*` (Dockerfiles) ·
`spikes/*` (verification harnesses) · `layouts/` (offices drawn in the internal editor) · `docs/`
(incl. `plans/` for the current task) · `audit/` (the audit record). Package scope is
`@ho/*`; sources are executed as TypeScript, with a build step only for the webview bundle, the sandbox
runner bundle and release binaries.

## Rules that matter most

- Pure core: `packages/core` and `packages/sim` have no I/O and no Bun/DOM globals. Side effects live in
  adapter packages behind the interfaces defined in core.
- Event-sourced: state changes are events appended to the store; projections are derived.
- Validate every boundary with Zod; never let agent output become a shell command in the daemon.
- Secrets never appear in images, container config, labels, logs, events, or this conversation.
- Tests and code comments are the owner's call. The September 2026 audit ran under "no tests, no code
  comments"; do not add either without an explicit instruction for the task at hand.
- Verify external facts (CLI flags, APIs, versions) online instead of guessing, and write the source and
  the date next to the claim.
- A number in documentation is a claim: measure it or drop it. `audit/VERIFICATION.md` is the format —
  the command and its real output, not a paraphrase.

## Working loop

Use the owner's current task as the scope. Implement, run relevant checks and `bun run check`, record
material decisions and verification, and commit with a descriptive Conventional Commits message.
The plan is context, not a restriction on explicitly authorized work.
