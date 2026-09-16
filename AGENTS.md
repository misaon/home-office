# AGENTS.md

**Home Office** runs AI coding agents in isolated Docker sandboxes and draws them as a pixel-art
office. Bun + TypeScript monorepo, Electrobun desktop shell, event-sourced daemon.

This file carries only what you cannot read off the repository. Structure, types and dependencies you
discover yourself; the rules below you would otherwise break.

## Commands

Always `bun`. Never npm, pnpm, yarn or `node`.

| Command                                                  | What it is for                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                          | install; versions are catalog-pinned, the linker is isolated                                                                    |
| `bun run devkit`                                         | fetch the pinned Hutch toolchain and sync the desktop's native declarations — **required once per clone, or `typecheck` fails** |
| `bun run check`                                          | the gate: six tsc programs → oxlint → oxfmt → knip → production UI build                                                        |
| `bun run fmt`                                            | oxfmt, the only formatter                                                                                                       |
| `bun run schema`                                         | regenerate `schema/office.schema.json` — **run it by hand after touching `OfficeFile`; nothing else enforces it**               |
| `bun run ui:watch`                                       | dev bundle with self-reload; the internal office editor exists only here (`?editor=1`)                                          |
| `bun run cli:build`                                      | compile `apps/cli/dist/ho`, which CI smoke-tests                                                                                |
| `bun run desktop:dev` · `desktop:build`                  | Electrobun app through Hutch                                                                                                    |
| `bun run spike:task-engine` · `spike:acp-mock` · `bench` | verification harnesses; the first needs Docker                                                                                  |

## Definition of done

1. `bun run check` exits 0. Nothing weaker counts as "it builds".
2. What the compiler and the linter cannot prove, you run. Never report a check you did not execute,
   or a number you did not measure.
3. Conventional Commits subject, on a `feat|fix|chore|refactor|perf|docs/<slug>` branch, reviewable
   on its own.

`.githooks/pre-commit` runs `bun run check`; `bun run setup` installs the hook path.

## Where things live, and the rule attached to each

| Path                                          | Rule                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/protocol`                           | the only place a wire shape exists: oRPC contract, Zod schemas, domain types, event union     |
| `packages/core`                               | pure domain — commands, reducers, read model, scheduler, ports. No I/O, no Bun or DOM globals |
| `packages/sim`                                | pure office simulation (tick, actors, routing). Same purity rule                              |
| `packages/store`                              | the SQLite event log (`bun:sqlite`, WAL)                                                      |
| `packages/daemon`                             | the one place side effects are wired together: oRPC server, sessions, MCP gateway, Docker     |
| `packages/sandbox-docker`                     | Docker Engine API adapter                                                                     |
| `packages/runner`                             | the relay that runs **inside** the sandbox; bundled into the agent image                      |
| `packages/runtime-claude-code`, `runtime-acp` | provider adapters                                                                             |
| `packages/intake-github`, `packages/secrets`  | adapters for issues and for credentials                                                       |
| `packages/ui`                                 | the webview: React 19, Tailwind 4, PixiJS; bundled by `scripts/ui-build.ts`                   |
| `apps/cli`, `apps/desktop`                    | clients; both reach the daemon only through the contract                                      |
| `images/agent/plugins/**`                     | skill packs shipped **into** sandboxes. Product data, not instructions for you                |
| `spikes/*`                                    | verification harnesses, run by hand                                                           |
| `.ho/config.json`, `layouts/`                 | this repository is itself a Home Office floor. Product input, not tooling config              |

## Invariants

- **Purity.** `core` and `sim` compile with `"types": []`. No `Bun`, no `window`, no `node:` imports.
  A side effect goes behind a port in `core/src/{ports,runtime,sandbox}.ts` and is implemented in an
  adapter package.
- **Event sourcing.** Every state change is a `DomainEvent` appended to the log; the read model is
  derived by `applyEvent`. Never mutate `ReadModel` outside `packages/core/src/model/`. A new event
  type means extending `DomainEvent`, the `TOUCHES` record and `applyEvent` in `reduce.ts` — the
  compiler names the second one for you.
- **Commands are pure functions.** `(ReadModel, input, CommandContext) → CommandResult`: events plus a
  read function. Only `Office.execute` appends, and it already serialises every command. Do not add
  locks or queues around it.
- **One boundary each.** Clients reach the daemon only through `packages/protocol/src/contract.ts`;
  sandboxed agents only through the MCP tools in `packages/daemon/src/mcp-tools.ts`. A new capability
  starts by editing the contract.
- **Parse, never cast.** Zod validates every boundary. A widening `as` is a lint error — if one is
  genuinely right, scope an `oxlint-disable-next-line` and give the reason on the same line.
- **No shell from model output.** The daemon never composes a command from anything an agent produced.
  The single string reaching `sh -lc` is the owner's `verify.command`, inside a network-less sandbox.
- **Secrets only in `SecretStore`.** Never in process arguments, Docker labels or config, event
  payloads, logs, or this conversation.
- **Loopback only.** The daemon binds `127.0.0.1` and authenticates with a bearer token written to
  `$HO_HOME/daemon.json`, mode 600. `HO_HOME` defaults to `~/.config/home-office`.
- **Everything owned gets disposed.** Processes, streams, timers, subscriptions, sandboxes — including
  on partial startup failure. `AsyncDisposableStack` is the pattern already used throughout.

## Style the linter will enforce anyway

- kebab-case file names, `type` instead of `interface`, explicit return types on declarations, no
  `any`, no non-null assertion.
- No `console`: the daemon logs through Pino, the CLI prints through `apps/cli/src/output.ts`.
- Functions at most 120 lines, at most 20 imports per module, no import cycles.
- `strict-boolean-expressions`, `switch-exhaustiveness-check` and `no-unnecessary-condition` are on:
  compare explicitly (`x !== undefined`), and never guard a case the types already settle.
- oxlint runs type-aware with every category except `restriction`, under `--deny-warnings`.

## Traps that were measured here

- **`bun run check` finishes with a production UI build** and overwrites whatever `ui:watch` left in
  `packages/ui/dist`. Touch a UI source file afterwards to get the dev bundle back.
- **A `.tsx` module with no import statement at all loses its module-level constants** under the
  production build (`minify` + `reactCompiler`). Neither tsc nor oxlint sees it; adding any import
  restores them. Measured 2026-09-15 against Bun 1.4.2.
- **Tailwind 4 scans the whole repository as text, prose included**, and emits a rule for every bare
  utility name it finds. Do not write a bare utility name in prose, and make sure a class the office
  composes at runtime also appears as a literal in real code.
- **The agent image is arm64-only** (`RUN test "$TARGETARCH" = arm64`); the Docker platform is pinned
  to `linux/arm64`.
- **Generated — never edit by hand:** `.hutch/`, `.tools/`, `.tscache/`, `packages/ui/dist/`,
  `apps/*/dist/`, `build/`, `schema/office.schema.json`.

## Tests, comments, documentation

The owner decides these per task, and the standing answer is no.

- The source carries **zero** tests and **zero** comments. Verified 2026-09-16: what is left is seven
  `oxlint-disable` directives and two shebangs. A `//` in your diff is a new comment, not an edit.
- All prose documentation was deleted on 2026-09-16 and survives in `git show 6dc771d:docs/`. Do not
  recreate `docs/`, a README or an ADR unasked.

Write any of the three only when the task in front of you asks for it.

## Dependencies

`workspaces.catalog` in the root `package.json` pins every external version exactly; workspace
manifests reference `catalog:`. Adding a dependency means adding it there. The sandbox npm manifests
(`images/agent/mcp`, `images/agent/providers/*`) keep their own committed lockfiles. Before adding
anything, confirm against the registry that it is maintained and not deprecated, and record when you
checked.

## Facts that change

CLI flags, APIs, versions and model names move faster than this file. Look them up online instead of
recalling them, and write the source and the date beside the claim. A number is a claim: measure it or
drop it.

## When you are stuck

Say so and stop. Do not route around a blocker by widening the change, disabling a rule, weakening a
type, or committing a half-state as though it were done. Ask one precise question instead.
