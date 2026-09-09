# ADR 001 — C1: Has the project outgrown its own shape? Does it need a framework?

**Status:** decided — no migration. **Confidence:** high (medium-high on option 4).
**Date:** 2026-09-08. All version and maintenance figures were read from the npm registry in this session.

## The problem

C1 asks whether the codebase has reached the size where hand-assembled structure costs more than a
framework's conventions. First the measured size:

| Layer                                | Files   | Lines      | What a migration would target      |
| ------------------------------------ | ------- | ---------- | ---------------------------------- |
| `@ho/protocol` + `@ho/core` (domain) | 37      | 3 543      | nothing — pure TypeScript with Zod |
| `@ho/daemon` + adapters              | 62      | 6 076      | NestJS, Effect, Fastify            |
| `@ho/ui`                             | 40      | 4 808      | Next.js, TanStack Start            |
| `@ho/sim`                            | 17      | 2 279      | Phaser, an ECS (see ADR 002)       |
| `apps/cli`                           | 22      | 1 273      | commander, citty (see ADR 006)     |
| `scripts`                            | 12      | 1 337      | nothing                            |
| **Total tracked code**               | **200** | **20 121** |                                    |

20 k lines across 17 workspaces is a medium codebase, and it is _already_ structured: ports and adapters
with a pure core, event sourcing with a single writer, one shared contract for three clients. So the real
question is not "is it big enough" but "does any framework replace machinery we currently maintain".

## Options

### 1. Keep the current shape — **recommended**

**Gain:** nothing to migrate, because the architecture already supplies what the candidates sell.
Dependency injection is `createRpcContext` (`packages/daemon/src/rpc/context.ts`); request validation is
Zod at every boundary; typed routing is `oc`/`implement` from one contract; error mapping is a single
middleware (`packages/daemon/src/rpc/router.ts:26-54`).
**Lose:** the convention-based onboarding a well-known framework gives a newcomer.
**Migration:** none. **Code deleted:** none. **Perf/RAM:** unchanged (daemon reaches "listening" in ~5 ms,
measured this session).

### 2. Next.js or TanStack Start for the UI — reject

**Gain:** routing, code splitting, an established data-fetching story.
**Lose:** most of the framework. The office UI is a **single-route, canvas-first** app served by a local
daemon over an authenticated WebSocket: no URLs, no SEO, no SSR, no sessions, no HTTP data fetching. The
server/client boundary and the router — Next's core value — are inapplicable, and it would add a second
server process the product deliberately does not have (`packages/daemon/src/static.ts` serves the bundle
with a strict CSP).
**Migration:** all 40 UI files plus the build script. **Code deleted:** `scripts/ui-build.ts` (84 lines),
maybe `static.ts` (52). **Perf/RAM:** worse — a second runtime, and with Pixi everything is a client
component anyway.

### 3. NestJS for the daemon — reject

**Gain:** DI container, module boundaries, decorator routing, a large ecosystem.
**Lose:** decorators are a TypeScript feature this repository has deliberately excluded —
`tsconfig.base.json` sets `erasableSyntaxOnly: true`, which forbids exactly the syntax NestJS is built on.
Adopting it means turning that flag off monorepo-wide and replacing explicit wiring with runtime
reflection, in a codebase whose stated value is that agent output never becomes a shell command.
Reflection makes that harder to audit.
**Migration:** all 38 daemon files. **Code deleted:** `rpc/context.ts` (52 lines), part of `launch.ts`.
**Perf/RAM:** worse — a DI container and metadata registry at startup.

### 4. Effect (`effect@3.22.1`, published 2026-08-25, 28.5 M weekly) — reject **for now**

The only genuinely tempting option, so it gets a fair reading.

**Gain:** Effect subsumes four things written by hand here — `Result` (5 lines,
`packages/core/src/result.ts`), the bounded async channel (95 lines, `async-channel.ts`), the promise-chain
command serialisation (`office.ts:54-56`), and the ad-hoc `Cancellation` type (`ports.ts:11-15`, a
structural stand-in for `AbortSignal` that exists only because `packages/core` compiles with
`types: []`). `Stream`, `Fiber`, `Scope` and `Either` cover all four with better composition, and `Layer`
would replace `createRpcContext`.
**Lose:** Effect cannot be adopted partially in a shared core. The moment `@ho/core` returns
`Effect<A, E, R>` instead of `Result<T, E>`, every command, every daemon caller and the UI's `applyEvent`
are in the Effect world. It is a second language inside TypeScript, and the learning cost lands on a
single owner. It also puts a large runtime dependency into `packages/core`, which today has exactly one
(`@ho/protocol`) and is deliberately light so the browser runs the same domain code.
**Migration:** all 37 files of protocol+core, all 38 daemon files, and the UI model layer — comfortably
over 15 % of the codebase, which under §5 of the brief would require the owner's approval first.
**Code deleted:** ~150 lines. **Perf/RAM:** the fiber runtime is fast but not free; for a few hundred
events and a handful of streams, plain promises are lower overhead.
**Why "for now":** the trade is ~150 lines of our own code for a whole-repo paradigm change plus a
permanent dependency in the pure core. If the daemon's concurrency grows — many sandboxes, retries with
backoff, structured cancellation trees — revisit; that is when Effect starts paying for itself.

### 5. Split the UI into its own repository — reject

**Gain:** none identified. **Lose:** the shared contract and the shared `@ho/sim`/`@ho/core` code, which
are precisely why the UI can fold the same event log the daemon does.

## Recommendation

**Do not migrate.** The project has not outgrown its structure; the ports-and-adapters split is _better_
than what these frameworks would impose, because it is what lets `@ho/core` and `@ho/sim` run unchanged in
both the browser and the daemon. What the codebase actually needs is in `audit/AUDIT.md`: indexes on the
projection (B4.1), a bounded chat log (B4.2), deduplication (B14), and the per-frame allocations in the
simulation (B18.1). Those are the costs that scale with use, and no framework addresses them.
