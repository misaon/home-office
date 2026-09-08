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
targets, type-aware oxlint with warnings denied, oxfmt and Knip. Missing desktop declarations fail.

Oxlint enables correctness, suspicious, pedantic and performance categories. Style is off except for
explicit rules. React hooks and JSX accessibility checks are enabled; automatic JSX does not require a
React namespace import. The separate experimental exhaustive-effect-dependencies rule is disabled;
standard exhaustive-deps remains enabled. CSS is covered by Knip in the UI workspace.

Use `bun run fmt` to format. Validate affected builds and actual runtime behavior when a static check
cannot establish correctness. Do not invent passing checks, coverage or benchmark numbers. No new tests
or code comments are added in the current audit, per the owner. Existing verification spikes can run.

## Resources and secrets

Every owned process, stream, listener, timer and subscription needs a cleanup path, including partial
startup failure. External operations need appropriate deadlines; queues and caches need explicit bounds.
Cancellation must propagate to the underlying work, not only stop its presentation.

Use `SecretStore` for provider credentials: native Bun secret storage or atomic owner-only files.
Never put secrets in subprocess arguments, Docker configuration/labels, event payloads or logs.
Untrusted tool/model output still requires care; generic logging is not universal content redaction.

The daemon only accepts loopback bindings. Remote TLS operation is future work. Container policies live
in the sandbox specs and Docker provider: non-root, restricted mounts, read-only rootfs, resource limits
and dropped capabilities. Provider-state volumes are persistent; temporary caches/config are distinct.

## Git and documentation

Use descriptive Conventional Commits and reviewable branches. Run relevant checks before committing.
Keep root dependencies in catalogs and lockfiles; sandbox npm manifests use their own committed locks.
Record material dependency/architecture choices in STACK and the audit or plan.

Current operational facts belong in ARCHITECTURE and README. Keep historical decisions in
`docs/history` with their dates. Do not turn an unverified plan checkbox into a claim of implementation.
Verify changing external facts against current primary documentation and report material limitations.
