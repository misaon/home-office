# Engineering conventions

The compiler, linter, formatter and package manifests are authoritative for enforced rules. This guide
explains intent; an explicitly authorized task can change the conventions and their implementation.

## Types and boundaries

Use the pinned TypeScript/Bun toolchain. `tsconfig.base.json` enables strict checking, exact optional
properties, unchecked indexed access, explicit overrides, index-signature access, exhaustive control
flow, erasable syntax and isolated modules. These are explicit options, not assumptions about defaults.
UI targets add DOM libraries and automatic React JSX. Pure packages exclude Bun/DOM globals.

Prefer discriminated unions, schema-derived types and `satisfies`. Parse external inputs before treating
them as domain types. Avoid `any`, non-null assertions and casts that hide unresolved validation errors.
Expected domain errors use the existing `Result` contract; adapter failures can throw with useful causes.

## Structure and state

Keep domain decisions and simulation pure. I/O belongs to adapters behind the existing core ports.
Persist state changes as events; projections are rebuilt from the event log. Serialized command
execution belongs to the daemon's Office, not ad hoc locks scattered among callers.

Prefer focused modules and maintained small dependencies over generic utility layers. Shared helpers
belong with the behavior they implement; there is no required `core/src/shared` directory. Lifecycle
owners can be classes. Published React state is immutable; owned internal simulation state may mutate.

Use the existing oRPC contract for clients and MCP schemas for agent tools. Keep repository, task,
agent and session ownership checks at command/tool boundaries. Source text is never a daemon shell
command. Prefer structured arguments and preserve external process exit codes.

## Checks

`bun run devkit` prepares the desktop's native type declarations. `bun run check` runs all 16 compiler
targets, type-aware oxlint with warnings denied, oxfmt, Knip **and the office UI build** — the last one
because the UI is compiled with Bun's React Compiler, so a UI change that only typechecks is not checked.
Missing desktop declarations fail.

Oxlint enables correctness, suspicious, pedantic and performance categories. Style is off except for
explicit rules. React hooks and JSX accessibility checks are enabled; automatic JSX does not require a
React namespace import. The separate experimental exhaustive-effect-dependencies rule is disabled;
standard exhaustive-deps remains enabled. CSS is covered by Knip in the UI workspace.

The rules worth knowing before writing code, because they change how it is written:
`typescript/no-unsafe-type-assertion` (an `as` that widens is an error — parse instead, or state the
reason in a scoped suppression), `typescript/no-deprecated`, `switch-exhaustiveness-check`,
`strict-boolean-expressions`, `import/no-cycle`, `import/max-dependencies` at 20 per module,
`eslint/max-lines-per-function` at 120, `unicorn/filename-case` kebab-case, and `eslint/no-console`
(the daemon logs through Pino; the CLI writes through `apps/cli/src/output.ts`). Every suppression that
survives is listed with its reason in [audit/SUPPRESSIONS.md](../audit/SUPPRESSIONS.md); there are two.

Use `bun run fmt` to format. Validate affected builds and actual runtime behavior when a static check
cannot establish correctness. Do not invent passing checks, coverage or benchmark numbers. Tests and code
comments are the owner's decision — the September 2026 audits were run under "no tests, no code comments",
and that instruction is per task, not a property of the repository. Existing verification spikes can run.

## Resources and secrets

Every owned process, stream, listener, timer and subscription needs a cleanup path, including partial
startup failure. External operations need appropriate deadlines; queues and caches need explicit bounds.
Cancellation must propagate to the underlying work, not only stop its presentation.

Use `SecretStore` for provider credentials: the OS credential store through `Bun.secrets`, or atomic
owner-only files where the host has none. `auto` decides by whether the store answers, not by
`process.platform`, and a timeout is not an absent store — it propagates instead of quietly writing the
secret somewhere else. Never put secrets in subprocess arguments, Docker configuration/labels, event
payloads or logs. Untrusted tool/model output still requires care; generic logging is not universal
content redaction.

The daemon only accepts loopback bindings. Remote TLS operation is future work. Container policies live
in the sandbox specs and Docker provider: non-root, restricted mounts, read-only rootfs, resource limits
and dropped capabilities. Provider-state volumes are persistent; temporary caches/config are distinct.

## Git and documentation

Use descriptive Conventional Commits and reviewable branches. Run relevant checks before committing.
Keep root dependencies in catalogs and lockfiles; sandbox npm manifests use their own committed locks.
Record material dependency/architecture choices in STACK and the audit or plan. A new dependency has to
survive the owner's rule — nothing deprecated, unmaintained or quiet — and the check is a registry lookup
recorded with its date, the way [audit/DEPENDENCIES.md](../audit/DEPENDENCIES.md) does it.

Current operational facts belong in ARCHITECTURE and README. Keep historical decisions in
`docs/history` with their dates. Do not turn an unverified plan checkbox into a claim of implementation.
Verify changing external facts against current primary documentation and report material limitations.
When a measurement contradicts something already written down — including a finding in the audit — correct
the document beside the original claim and say what the measurement was; `audit/AUDIT.md` keeps its
withdrawn recommendations for exactly that reason.
