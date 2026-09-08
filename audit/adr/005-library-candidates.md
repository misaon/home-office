# ADR 005 — C5: Where do we write code a light, modern third-party library could write for us?

**Status:** decided. **Confidence:** high.
**Date:** 2026-09-08. Every figure comes from the npm registry sweep recorded in `audit/DEPENDENCIES.md`.

## The problem

C5 asks for a standalone candidate list, not just the B16/B17 findings. So this ADR inverts the audit's
usual direction: it starts from **our own code** and asks, for each substantial piece of home-grown
machinery, whether a maintained library would take it over.

The owner's rule constrains the answer: no deprecated, unmaintained or quiet dependencies, and _"if no
library meets the criteria, rather keep the own implementation and tell me"_. Several answers below are
exactly that.

## The full candidate list

| #   | Our code                                                                         | Lines     | Library candidate                                                                 | Verdict                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 62 `...(x === undefined ? {} : {k:x})` spread guards                             | ~120      | `type-fest@5.9.0` (2026-08-30, 337.8 M weekly) to type one `compact()` helper     | **ADOPT** — the biggest readability win in the audit                                                                                                                                                                               |
| 2   | `DistributiveOmit` (`protocol/src/events.ts:108`)                                | 1         | `type-fest`'s `DistributedOmit`                                                   | **ADOPT** — same dependency                                                                                                                                                                                                        |
| 3   | `crop`/`place`/`opaqueBounds`/`splitStrip` (`scripts/lib/raster.ts`)             | ~80       | `sharp@0.35.4` — **already a dependency**                                         | **ADOPT** — see ADR 003                                                                                                                                                                                                            |
| 4   | `isRecord`/`isSize`/`isBox`/`isSidecar` (`scripts/lib/import-target.ts:170-181`) | 12        | `zod@4.5.4` — **already in the lockfile**, just not a root devDependency          | **ADOPT**                                                                                                                                                                                                                          |
| 5   | `stty -echo` hidden prompt (`apps/cli/src/commands/secret.ts:8-23`)              | 16        | `@clack/prompts@1.8.0` (2026-09-07, 20.4 M weekly, 4 deps)                        | **KEEP OURS** — withdrawn in Wave 6; the Ctrl-C bug it was to fix does not exist (see below)                                                                                                                                       |
| 6   | No colour anywhere in the CLI                                                    | —         | `yoctocolors@2.2.0` (2026-07-26, 34.5 M weekly, 0 deps)                           | **ADOPT** — chosen over `picocolors` (202 M weekly but 23 months without a release) purely on the activity criterion                                                                                                               |
| 7   | `proper-lockfile` usage, 3 sites                                                 | ~20       | none that meets the criteria                                                      | **REPLACE with our own** — see below                                                                                                                                                                                               |
| 8   | `Result<T,E>` (`core/src/result.ts`)                                             | 5         | `neverthrow@8.2.0`, last release **2025-02-21**                                   | **KEEP OURS** — 19 months quiet, and it would trade 5 lines for a class hierarchy                                                                                                                                                  |
| 9   | Hand-rolled UUIDv7 (`core/src/ids.ts:18-33`)                                     | 20        | `uuid@14.0.2` (2026-08-18, 254.8 M weekly) has `v7()`                             | **KEEP OURS** — `packages/core` injects `Clock` and `Randomness` so the domain replays deterministically from the log; a library reaching for ambient crypto trades that property for 20 lines. Verified correct against RFC 9562. |
| 10  | Bounded async channel (`core/src/async-channel.ts`)                              | 95        | `it-pushable@3.2.4` (286 k weekly)                                                | **KEEP OURS** — thin adoption, and it does not implement the fail-the-slow-consumer back-pressure this channel needs (at capacity `push` records a failure and closes, which is what protects the daemon)                          |
| 11  | A* with clearance and turn costs (`sim/src/grid.ts`)                             | 70        | `tinyqueue@3.0.0` for the heap — **already used**; no pathfinder evaluated as fit | **KEEP OURS** — the cost function (clearance-weighted, turn-penalised, direction in the search state) _is_ the movement feel; a generic pathfinder would not express it                                                            |
| 12  | `errorMessage` idiom, 24 copies                                                  | 24        | `serialize-error` and friends                                                     | **KEEP OURS, deduplicated** — the fix is one three-line helper (B14.1); a library would do far more than wanted                                                                                                                    |
| 13  | Geometric sprite stand-ins (`ui/src/office/stand-ins.ts`)                        | 233       | none — bespoke art code                                                           | **KEEP OURS** — and it is live, not dead: most furniture keys have no delivered sprite yet                                                                                                                                         |
| 14  | Wall-junction tile composition (`ui/src/office/walls.ts`)                        | 295       | `@pixi/tilemap@5.0.2` (2.9 k weekly, 2025-07-14)                                  | **KEEP OURS** — rejected in ADR 002                                                                                                                                                                                                |
| 15  | Camera fit (`ui/src/office/scene.ts#fit`)                                        | 15        | `pixi-viewport@6.0.3` (2024-11-27)                                                | **KEEP OURS** — 22 months quiet, for 15 lines                                                                                                                                                                                      |
| 16  | Hand-rolled mutation state in 10 UI components                                   | ~200      | `@tanstack/react-query@5.102.8` — **already a dependency**, `useMutation` unused  | **ADOPT** — B29.1                                                                                                                                                                                                                  |
| 17  | Two WebSocket handshakes (`ui/src/rpc.ts`, `cli/src/client.ts`)                  | ~80       | none; oRPC does not own the socket lifecycle                                      | **KEEP OURS, deduplicated** — one shared helper (B29.2)                                                                                                                                                                            |
| 18  | 4-way typecheck pool (`scripts/typecheck.ts`)                                    | 18        | `tsc --build`, `bun run --filter`                                                 | **KEEP OURS** — `--build` requires emit (TS6310, proved this session); `--filter` needs a script in all 16 workspaces to replace 18 lines                                                                                          |
| 19  | `splitImports` argv scan (`cli/src/commands/project.ts:83-98`)                   | 15        | `node:util` `parseArgs` with `multiple: true` — **already imported**              | **ADOPT** — proved empirically on Bun 1.4.2 (B15.3)                                                                                                                                                                                |
| 20  | Byte formatting, 3 divergent copies                                              | 6         | `pretty-bytes` and similar                                                        | **KEEP OURS, deduplicated** — one `formatBytes` in `@ho/protocol` (B5.3); the divergence is the bug, not the absence of a library                                                                                                  |
| 21  | `USAGE` string + 18-arm dispatch switch                                          | ~130      | `commander@15.0.0`, `citty@0.2.2`                                                 | **see ADR 006**                                                                                                                                                                                                                    |
| 22  | Collection helpers                                                               | scattered | `es-toolkit@1.52.0` (2026-09-07, 43.7 M weekly, 0 deps), `remeda@2.47.0`          | **KEEP NATIVE** — the code uses `toSorted`, `Map`, `Set`, `flatMap`; nothing to delete. Both libraries pass the criteria, so this is a merit rejection, not a maintenance one                                                      |
| 23  | Pattern matching in folds                                                        | scattered | `ts-pattern@5.9.0` (2025-10-26)                                                   | **KEEP NATIVE** — `switch` with `switch-exhaustiveness-check` already gives exhaustive matching at zero runtime cost                                                                                                               |
| 24  | Procedural placeholder characters (`scripts/assets-placeholders.ts`)             | 243       | none                                                                              | **KEEP OURS** — bespoke, and it must not be run casually: it **overwrites tracked sprite PNGs**                                                                                                                                    |

## The one case with no acceptable library: `proper-lockfile`

Three sites need mutual exclusion: one daemon per state directory (`packages/daemon/src/index.ts:35`), one
desktop instance (`apps/desktop/src/bun/lock.ts:5`), and one git operation per mirror
(`packages/daemon/src/mirrors.ts:41`).

| Candidate                     | Fails on                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| `proper-lockfile` (incumbent) | last release 2022-06-24, last commit 2023-10-25, 21 open issues         |
| `lockfile`                    | unmaintained for longer; `proper-lockfile` superseded it                |
| `@napi-rs/lock`               | does not exist on npm (404 in this session)                             |
| `async-lock`, `async-sema`    | in-process only; cannot exclude a second OS process, which is the point |

So per the owner's rule, the answer is our own implementation, sized to each need:

- **Single-instance (daemon, desktop):** `fs.mkdir(dir)` is atomic and fails with `EEXIST` on every POSIX
  and Windows filesystem. Combined with the pid already in `daemon.json` and a staleness check, that is
  what `proper-lockfile` does, in ~25 lines with no dependency.
- **Mirror serialisation:** the mirrors are only ever touched by the one daemon holding the state-directory
  lock, so an in-process `Map<string, Promise>` keyed by mirror path is both sufficient and _stronger_ than
  an advisory file lock — it cannot go stale.

Net: 2 direct and 3 transitive dependencies removed.

## Recommendation

**Adopt** in seven places (1-4, 6, 16, 19), of which **four need no new dependency at all** — `sharp`,
`zod`, `useMutation` and `parseArgs` are already present and simply unused for the job. **Add** two small
dependencies: `type-fest` (types only, erased at build) and `yoctocolors`. **Remove** `proper-lockfile` and
`@types/proper-lockfile`. **Keep our own** in the twelve remaining cases, each for a
stated reason — nine because no candidate meets the maintenance criteria, three because the native language
or an existing dependency already does it better.

The pattern worth naming: the biggest wins here are not new libraries. They are **dependencies the
repository already pays for and does not use**.

## Correction after Wave 6 — candidate 5 (`@clack/prompts`) is withdrawn

The verdict rested on the premise of finding B5.4: that Ctrl-C at the hidden prompt leaves the user's shell
with echo off. Measured under a pty in Wave 6, that premise is false — Bun snapshots the terminal's termios
at startup and restores it from both `atexit` and its own `SIGINT` handler, so a `bun` process cannot leak
`stty -echo` to the shell however it dies (evidence and Bun source references in the B5.4 correction in
`audit/AUDIT.md`).

What remains of the case for `@clack/prompts` is one 16-line function that already works: a hidden prompt
used by exactly one subcommand (`ho secret set`). Against that, the library brings four transitive
dependencies into a CLI that is compiled with `bun build --compile` and started once per invocation, and
this audit's own rule for candidate 8 — do not trade a few working lines for a dependency — applies
unchanged here. So `readSecret()` stays as it is, and the net dependency change of this audit is one
package smaller than first recorded.
