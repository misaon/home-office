# ADR 004 — C4: Reviewing the current setup, libraries, approach and patterns — what holds up and what does not?

**Status:** decided. **Confidence:** high.
**Date:** 2026-09-08. Version and maintenance data from the npm registry and the GitHub API, read in this
session.

## The problem

C4 asks for a verdict on the whole stack rather than a list of defects. The honest headline: **the stack
holds up almost entirely.** 27 of 30 catalog entries are the current latest release, nothing is deprecated,
`bun audit` is clean, and the architecture is better than the frameworks that would replace it (ADR 001).
Five specific things do not hold up, and they are named below.

## What holds up, and why

| Choice                                                                                                                           | Verdict | Why it holds                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bun 1.4.2 as runtime, package manager, bundler and script runner**                                                             | keep    | One tool replaces node + npm + esbuild + ts-node. `catalog:` makes version drift structurally impossible; `linker = "isolated"` removes phantom dependencies; `bun:sqlite` removes a native module; `Bun.spawn` gives per-process timeouts the wrappers in ADR 005 do not. Frozen install reproduces in 28 ms. |
| **TypeScript 7.0.2 with `erasableSyntaxOnly`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`** | keep    | The strongest type baseline in this audit's experience: zero `any`, zero `@ts-ignore`, zero non-null assertions across 20 121 lines. The one cost — 62 spread guards (B15.1) — is fixable with a helper, not by relaxing the flag.                                                                             |
| **oxlint 1.82.0 + oxfmt 0.67.0 instead of ESLint + Prettier**                                                                    | keep    | The whole `check` pipeline in 2.33 s wall. 870 rules across 15 plugins with type-aware linting via `oxlint-tsgolint`. Proved in this session that it genuinely lints — a probe file produced 7 errors.                                                                                                         |
| **Zod 4.5.4 as the single validation layer**                                                                                     | keep    | Every boundary validated the same way: RPC contract, Docker API responses, runner frames, stream-json lines, config, sprite sidecars. Branded UUIDv7 ids give type-level separation of entity kinds.                                                                                                           |
| **oRPC 1.15.0 over WebSocket**                                                                                                   | keep    | One contract, three clients, typed errors declared in the contract, event iterators for streams. Nothing drifts between clients because there is only one definition.                                                                                                                                          |
| **Event sourcing on `bun:sqlite` + Drizzle**                                                                                     | keep    | Single writer (`Office.execute`), one transaction per command, projections derived. This is what lets the UI fold the same log the daemon does.                                                                                                                                                                |
| **Ports and adapters with a pure core**                                                                                          | keep    | `packages/core` and `packages/sim` compile with `types: []` and no I/O, which is exactly why they run unchanged in a browser.                                                                                                                                                                                  |
| **PixiJS 8**                                                                                                                     | keep    | See ADR 002.                                                                                                                                                                                                                                                                                                   |
| **Docker Engine HTTP API over the unix socket, no SDK**                                                                          | keep    | 145 lines with Zod-validated responses instead of a large SDK, and correct multiplexed-log demuxing. The one shell-out (`docker buildx build`) is justified in the code and PATH-widened for the desktop app.                                                                                                  |
| **React 19.2.8 + React Compiler + Zustand + TanStack Query + Tailwind 4**                                                        | keep    | All current, and the compiler is what makes the panels' inline handlers fine. Two caveats: mutations bypass TanStack Query (B29.1) and the snapshot is copied per frame (B6.2).                                                                                                                                |
| **`@ho/agent-kit` shipping skills as Claude Code plugins into the image**                                                        | keep    | Curated ECC skills with `VENDOR.md` provenance and the upstream MIT licence retained; `--plugin-dir` is the documented mechanism.                                                                                                                                                                              |
| **RTK in the sandbox to cut command-output tokens**                                                                              | keep    | `rtk-ai/rtk` pushed 2026-09-08, 79 508 stars, Apache-2.0, built from a pinned git revision. The right idea; B33.5 adds the complementary `BASH_MAX_OUTPUT_LENGTH`.                                                                                                                                             |

## What does not hold up

| #   | Item                                                                                                                                                                                                                          | Verdict                                                   | Where                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| 1   | **`proper-lockfile@4.1.2`** — last release 2022-06-24, last commit 2023-10-25, 21 open issues                                                                                                                                 | **replace** — fails the owner's explicit maintenance rule | AUDIT B16.3, `audit/DEPENDENCIES.md` |
| 2   | **Claude Code settings** — `includeCoAuthoredBy` deprecated since v2.0.62; `includeGitInstructions` left at its default, paying for guidance that contradicts our own prompt; `autoUpdatesChannel` dead in a read-only rootfs | **fix**                                                   | AUDIT B33.1-3                        |
| 3   | **No indexes on the projection** — every non-primary-key query is a full scan over collections that grow forever                                                                                                              | **fix**                                                   | AUDIT B4.1, B4.2                     |
| 4   | **Per-frame allocation in the simulation and renderer** — an occupancy `Set` per walking actor per frame, a filtered actor array per frame                                                                                    | **fix**                                                   | AUDIT B18.1, B11.3                   |
| 5   | **`apps/desktop` compiled with four strictness flags off** — because third-party devkit source sits inside the program                                                                                                        | **fix**                                                   | AUDIT A1.6                           |

Two more are less "does not hold up" than "was never finished": ACP `usage_update` is dropped so three of
four providers report no usage (B30.1), and the intake subscription can die permanently under load (B29.3).

## Patterns: a verdict on each

**Holds up.** Result-as-value instead of exceptions for expected failures; commands returning events rather
than mutating; discriminated unions with exhaustiveness checking; branded ids; injected `Clock` and
`Randomness` so the domain replays deterministically; bounded channels that fail a slow consumer instead of
buffering without limit; a back-pressure gate that lets an animation hold the daemon (unusual and genuinely
clever); deny-all-then-allowlist `.dockerignore`; digest-pinned base images with a content hash driving
rebuilds.

**Does not hold up.** The 62-fold spread guard (B15.1) and the 24-fold error-message idiom (B14.1) are
patterns by repetition, not by design. `(string & {})` on the secret-store key (B22.1) is a pattern that
defeats the type system it decorates. Mutating `FloorTemplate` to hold one animation flag (B9.2) is a
pattern with a better mechanism sitting right next to it.

## Recommendation

Keep the stack. Fix the five items above plus the two unfinished ones, in the waves the brief lays out.
There is no case here for rewriting anything: the problems are all local, and every one has a named file
and line in `audit/AUDIT.md`.
