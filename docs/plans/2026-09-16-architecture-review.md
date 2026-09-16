# The architecture, checked against the code rather than the document

The owner's task, 2026-09-16: analyse the whole codebase for architectural correctness, and redo
anything that is on the wrong pattern — permission to rewrite explicitly given.

**Nothing was rewritten, because nothing was found wrong.** That is a conclusion, not a shrug: every
rule `docs/ARCHITECTURE.md` states was tested against the source, and each one holds. What this task
produced instead is `scripts/architecture-check.ts`, which turns those rules from a document into
something `bun run check` refuses to break.

## What was tested, and what the code said

| Rule                                              | How it was tested                                                                      | Result                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layered package graph, no cycles, no upward edges | Every `@ho/*` dependency in all 14 manifests                                           | **Holds.** `protocol` → nothing; `core`/`sim` → protocol; adapters → core + protocol; `daemon` → all; apps → daemon                              |
| `core` and `sim` are pure                         | Grep for `node:`, `Bun.`, `process.`, `fetch(`, DOM globals, `Date.now`, `Math.random` | **Holds.** Zero hits, and `types: []` in both tsconfigs enforces it at compile time                                                              |
| The projection is mutated only by the reducer     | Every `.tasks.set(` / `.agents.set(` / … across core, daemon and ui                    | **Holds.** Only `core/src/model/reduce.ts`                                                                                                       |
| Events are appended in one place                  | Every `store.append(` outside `@ho/store`                                              | **Holds.** Only `Office.#execute`                                                                                                                |
| Concrete adapters are wired, not reached into     | Every import of an adapter package                                                     | **Holds.** Five sites: `launch.ts` and `runtimes.ts` (composition), `office.ts` (the store factory), `config.ts` (type-only), `daemon-info.ts`   |
| The daemon does not invent domain entities        | Search for `const task: Task = {` and its siblings                                     | **Holds.** None; entities come from core commands                                                                                                |
| Every external boundary is parsed                 | Zod usage in each adapter                                                              | **Holds.** Docker Engine API, `gh` output, ACP messages, runner frames, SQLite rows, `.ho/config.json`, MCP inputs, RPC via the oRPC contract    |
| The UI reads the domain, it does not decide it    | Every `@ho/core` import in `packages/ui`                                               | **Holds.** `applyEvent`, `createReadModel`, `bossOf`, `chatOf`, `canTransition`, `isTerminal`, `defaultChoice`, socket helpers — **no commands** |

The last row is the one worth dwelling on. `sheet-task.tsx` imports `canTransition` from core rather
than reimplementing "which moves are legal". The office offers exactly the moves the daemon would
accept, because both read the same function. That is what the shared pure core is _for_, and it is the
single strongest sign that this split is real rather than decorative.

## The daemon is layered inside, not tangled

`packages/daemon` carries seven responsibilities in 49 modules, which is the kind of thing that turns
into a ball of mud. Measured: **132 internal edges, 2.7 per module**, longest chain 14. Fan-in is led by
infrastructure (`logger.ts` 13, `config.ts` 12, `office.ts` 8, `labels.ts` 7); fan-out by the composition
root (`launch.ts` 17). Infrastructure at the bottom, services in the middle, composition on top — which
is what a layered package looks like from the inside.

## The audit already asked the big question

[ADR 001](../../audit/adr/001-framework-migration.md) asked whether the project had outgrown its shape
and needed a framework. Its recommendation: _"Do not migrate. The project has not outgrown its
structure; the ports-and-adapters split is better than what these frameworks would impose, because it is
what lets `@ho/core` and `@ho/sim` run unchanged in both the browser and the daemon."_

It named four costs that scale with use instead. All four are closed:

| Named in ADR 001                              | Today                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| B4.1 indexes on the projection                | Six indexes in `read-model.ts`                                            |
| B4.2 a bounded chat log                       | `CHAT_TAIL = 500`                                                         |
| B14 deduplication                             | `mailSourceKey`, used by the reducer and the queries                      |
| B18.1 per-frame allocations in the simulation | `lazyOccupancy` — measured at 0.022 ms for 120 actors, 0.1 % of the frame |

So the question was asked properly, answered with reasoning I cannot improve on, and the follow-up work
was done. Re-opening it today would need evidence I do not have.

## Three things noted, none a defect

- **`daemon-info.ts` imports `writePrivateFile` from `@ho/secrets`.** An atomic owner-only file write is
  a filesystem primitive, not a credential concern, so the package name misleads. The dependency points
  the right way (daemon → secrets, which exists anyway) and the alternative — a third package for one
  function, or a second copy of it — is worse. Left alone, and the checker lists the file as a
  composition site so the exception is explicit rather than silent.
- **`protocol/format.ts` carries `formatBytes`.** Presentation in the contract package. Deliberate: both
  clients format the daemon's numbers identically because they share the function.
- **`Office.execute` serialises every command across every floor** through one promise chain. This is
  the one global lock in the system, and it is what guarantees the projection never sees a half-applied
  command. Measured cost per command is around 0.2 ms
  ([the performance review](2026-09-15-performance.md)), so it is not a throughput limit at any
  plausible scale — but it is a real ceiling and it should be named rather than discovered later.

## What changed: the rules grew teeth

`scripts/architecture-check.ts`, wired into `bun run check`. It enforces five things nothing enforced
before — the layering, the purity of core and sim, the single projection writer, the single appender,
and commands staying server-side — plus the adapter rule with its composition sites listed by name.

Two of the architecture's rules already had teeth: `types: []` for purity, and oxlint's
`import/no-cycle`. The rest held only because everyone who touched the repository happened to respect
them. Today they are intact; that was worth confirming and is worth keeping.

### Verified by breaking it, 2026-09-16

A guard that cannot fail is worth nothing, so four violations were introduced on purpose and reverted:

```
✖ layering: @ho/core (layer 1) may not depend on @ho/daemon
✖ purity: packages/core/src/ids.ts reaches for a host global; core and sim take them as ports
✖ projection: packages/daemon/src/gc.ts writes an entity map; only packages/core/src/model/reduce.ts may
✖ ui: packages/ui/src/design/board.tsx imports the command createTask; the office asks the daemon to run commands
4 architecture violation(s)
```

Each rule caught its own violation and the run exited non-zero. After `git checkout` of the four files
the check passes again, and `bun run check` is green.

## Not tested

- **Whether the seven daemon responsibilities should be seven packages.** The import graph says the
  internal layering is already there; splitting would add manifests without changing the structure. Not
  a measurement, a judgement — and ADR 001's reasoning covers it.
- **Runtime behaviour of the layering.** This checks imports and manifests, which is where layering
  violations are written. It cannot see one smuggled through dynamic dispatch, and no such mechanism
  exists in this codebase today.
