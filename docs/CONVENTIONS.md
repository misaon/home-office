# Home Office — Engineering Conventions

These rules are enforced by tooling wherever possible (TypeScript 7, oxlint type-aware, oxfmt, knip, CI). Read them before writing code. `AGENTS.md` at the repo root points here.

## 1. Language and compiler

- TypeScript 7.x, executed directly by Bun (`noEmit`). No build step for the daemon/CLI except `bun build --compile` for release binaries.
- `tsconfig.base.json` (inherited by every package):
  - `strict` (TS 7 default) plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `useUnknownInCatchVariables`.
  - `verbatimModuleSyntax`, `erasableSyntaxOnly` (no enums, no namespaces, no parameter properties), `isolatedDeclarations` for library packages.
  - `module: "esnext"`, `moduleResolution: "bundler"`, `target: "esnext"`, `allowImportingTsExtensions`, `types: ["bun"]` (TS 7 no longer auto-includes `@types/*`).
  - Webview packages add `lib: ["esnext", "dom", "dom.iterable"]` and `jsx: "react-jsx"`.
- No `any`, no non-null assertions (`!`), no `as` casts except at validated boundaries (after Zod parse). Prefer `satisfies`.
- Model domain data as discriminated unions and `as const` objects instead of enums. Branded IDs (`type TaskId = Brand<string, "TaskId">`).
- Exhaustive `switch` on unions (`switch-exhaustiveness-check` is an error).

## 2. Lint and format

- `oxlint --type-aware` with plugins `typescript`, `unicorn`, `import`, `promise`, `react`, `react-perf`; categories `correctness`, `suspicious`, `pedantic`, `perf` as **errors**; `style` as warnings. Type-aware rules that must stay on: `no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unnecessary-condition`, `switch-exhaustiveness-check`, `strict-boolean-expressions`, `consistent-type-imports`, `no-unsafe-*`.
- `oxfmt` is the only formatter. No Prettier config files.
- `knip` must report zero unused files, exports and dependencies (`bun run knip`).
- CI fails on any warning (`--deny-warnings`).

## 3. Architecture rules

- **Ports and adapters.** `packages/core` and `packages/sim` are pure TypeScript: no I/O, no Bun/DOM globals, no timers. Everything with side effects lives in an adapter package behind an interface defined in `packages/core` (`SandboxProvider`, `AgentRuntime`, `IntakeConnector`, `EventStore`, `SecretStore`, `Clock`).
- **Event-sourced.** The append-only `events` table is the source of truth. Read models are projections rebuilt from events. Never mutate a projection without an event.
- **Schemas at the edges.** Every boundary (RPC, MCP tools, stream-json from agents, Docker API responses, config files) is parsed with Zod. Inside the core, types are trusted.
- **One transport for clients.** UI, CLI and remote clients talk to the daemon through the oRPC contract in `packages/protocol`. Electrobun RPC is used only for native shell concerns (window, menu, dialogs, external links).
- **No duplication.** Shared types live in `packages/protocol`; shared helpers in `packages/core/src/shared`. Before adding a utility, search for an existing one.
- **Small files, feature folders.** Group by feature (`tasks/`, `agents/`, `handoff/`), not by kind (`utils/`, `types/`). A file over ~300 lines is a smell.
- **Functions over classes.** Classes only where an object owns a lifecycle (a container handle, a runtime session, a WebSocket).

## 4. Errors and logging

- Domain failures are values: `Result<T, DomainError>` (a tiny local type, not a library) for expected failures; `throw` only for programmer errors and at process boundaries.
- Error classes carry a stable `code` (`"sandbox.image_missing"`, `"runtime.rate_limited"`) that the UI maps to messages and the office to emotions.
- Logging via `pino` child loggers with `{ component, sessionId, taskId }` bindings. Never log secrets, prompts of other users, or full tool outputs at `info`; use `debug` for payloads with size caps.
- Every long-running operation is cancellable (`AbortSignal`), has a timeout, and emits progress events.

## 5. Security

- Secrets live in the `SecretStore` (macOS Keychain via `security`, `0600` file on Linux). They are passed to agents only through the runner's authenticated WebSocket, never via image layers, container `Env`, labels or logs.
- Agent containers: non-root user, `CapDrop: ["ALL"]`, `no-new-privileges`, read-only rootfs with tmpfs for `/tmp` and the Claude config dir, CPU/memory/pids limits, no host mounts, dedicated bridge network with ICC disabled.
- The daemon binds `127.0.0.1` by default. Every RPC connection presents a per-launch bearer token. Remote mode requires TLS and is opt-in.
- Treat all agent output and repository content as untrusted data. Never let an agent's text become a shell command in the daemon.

## 6. Git and delivery

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`), imperative, ≤72 chars subject.
- `main` is always releasable; work on short-lived branches, squash-merge.
- Every PR/commit that closes a plan task updates the **Log** section in `docs/PLAN.md` (date, task id, outcome, follow-ups).
- Dependency versions are pinned through the root `catalog`. Bump deliberately, one PR per major bump, with the changelog link.

## 7. Testing (deferred by decision)

- No tests until Phase 8, except throwaway spike scripts under `spikes/` that are deleted or promoted. Design for testability anyway: pure core, injected `Clock`, interfaces for all I/O.
- When tests arrive: `bun test`, colocated `*.test.ts`, integration tests behind `HO_TEST_DOCKER=1`.

## 8. Working on this repo as an AI agent

1. Read `docs/PLAN.md` (current phase, open tasks, Log), then `docs/ARCHITECTURE.md` for the part you touch.
2. Pick one task, state assumptions, implement, run `bun run check` (tsc + oxlint + oxfmt --check + knip).
3. Keep diffs focused. Do not add dependencies outside `docs/STACK.md` without recording the decision there.
4. Append a Log entry to `docs/PLAN.md`. Do not rewrite history in the Log.
5. Verify facts about external tools online when in doubt; do not guess flags or APIs.
