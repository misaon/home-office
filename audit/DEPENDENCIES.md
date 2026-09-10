# Dependencies

Every third-party package the repository declares, checked against the npm registry and (where the answer
mattered) the GitHub API on **2026-09-08** in this session. "modified" is the registry's `modified`
timestamp — the last publish of any version of that package.

## Method

```
GET https://registry.npmjs.org/<pkg>/latest                       → version, deprecated, license, deps
GET https://registry.npmjs.org/<pkg>  (install-v1 accept header)  → modified
GET https://api.npmjs.org/downloads/point/last-week/<pkg>         → weekly downloads
GET https://registry.npmjs.org/<pkg>/<pinned version>             → the pinned version still exists?
GET https://api.github.com/repos/<owner>/<repo>                   → archived, pushed_at, open issues
```

## Verdicts at a glance

| Package                          | Pinned   | Latest     | Deprecated | Last publish   | Weekly                   | Licence    | Runtime deps | Verdict                                          |
| -------------------------------- | -------- | ---------- | ---------- | -------------- | ------------------------ | ---------- | ------------ | ------------------------------------------------ |
| `typescript`                     | 7.0.2    | 7.0.2      | no         | 2026-09-08     | 244.7 M                  | Apache-2.0 | 20           | **keep**                                         |
| `oxlint`                         | 1.82.0   | 1.82.0     | no         | 2026-09-07     | 19.0 M                   | MIT        | 0            | **keep**                                         |
| `oxlint-tsgolint`                | 7.0.2001 | 7.0.2001   | no         | 2026-07-21     | 6.2 M                    | MIT        | 0            | **keep**                                         |
| `oxfmt`                          | 0.67.0   | 0.67.0     | no         | 2026-09-07     | 12.1 M                   | MIT        | 1            | **keep**                                         |
| `knip`                           | 6.34.0   | **6.35.0** | no         | 2026-09-08     | 10.0 M                   | ISC        | 13           | **bump**                                         |
| `zod`                            | 4.5.4    | 4.5.4      | no         | 2026-08-29     | 246.7 M                  | MIT        | 0            | **keep**                                         |
| `pino`                           | 10.3.1   | 10.3.1     | no         | 2026-08-15     | 43.8 M                   | MIT        | 11           | **keep**                                         |
| `pixi.js`                        | 8.20.1   | 8.20.1     | no         | 2026-09-08     | 920 k                    | MIT        | 10           | **keep** (see ADR 002)                           |
| `react` / `react-dom`            | 19.2.8   | 19.2.8     | no         | 2026-09-08     | 152.8 M / 143.7 M        | MIT        | 0 / 1        | **keep**                                         |
| `@types/react`                   | 19.2.18  | 19.2.18    | no         | 2026-07-30     | 141.8 M                  | MIT        | 1            | **keep**                                         |
| `@types/react-dom`               | 19.2.7   | 19.2.7     | no         | 2026-09-03     | 118.5 M                  | MIT        | 0            | **keep**                                         |
| `tailwindcss`                    | 4.3.3    | 4.3.3      | no         | 2026-09-08     | 110.9 M                  | MIT        | 0            | **keep**                                         |
| `bun-plugin-tailwind`            | 0.1.2    | 0.1.2      | no         | **2025-10-09** | 221 k                    | MIT        | 0            | **keep, watch**                                  |
| `zustand`                        | 5.0.15   | 5.0.15     | no         | 2026-08-13     | 49.3 M                   | MIT        | 0            | **keep**                                         |
| `@tanstack/react-query`          | 5.102.8  | 5.102.8    | no         | 2026-08-27     | 55.4 M                   | MIT        | 1            | **keep, use more**                               |
| `drizzle-orm`                    | 0.45.2   | 0.45.2     | no         | 2026-08-12     | 19.0 M                   | Apache-2.0 | 0            | **keep**                                         |
| `drizzle-kit`                    | 0.31.10  | 0.31.10    | no         | 2026-08-11     | 15.8 M                   | MIT        | 4            | **keep**                                         |
| `@orpc/{client,server,contract}` | 1.15.0   | 1.15.0     | no         | 2026-09-07     | 1.17 M / 1.05 M / 0.89 M | MIT        | 4 / 11 / 4   | **keep**                                         |
| `@modelcontextprotocol/sdk`      | 1.30.0   | 1.30.0     | no         | 2026-07-27     | 47.9 M                   | MIT        | 17           | **keep**                                         |
| `@agentclientprotocol/sdk`       | 1.4.0    | 1.4.0      | no         | 2026-08-20     | 8.1 M                    | Apache-2.0 | 0            | **keep**                                         |
| `electrobun`                     | 2.0.1    | 2.0.1      | no         | 2026-09-08     | 50.5 k                   | MIT        | 0            | **keep** (12.8 k stars, pushed today)            |
| `sharp`                          | 0.35.4   | 0.35.4     | no         | 2026-08-26     | 69.6 M                   | Apache-2.0 | 3            | **keep, use more**                               |
| `tinyqueue`                      | 3.0.0    | 3.0.0      | no         | **2024-07-06** | 7.8 M                    | ISC        | 0            | **keep** (repo pushed 2026-04-05, 3 open issues) |
| `proper-lockfile`                | 4.1.2    | 4.1.2      | no         | **2022-06-24** | 22.4 M                   | MIT        | 3            | **REPLACE** — see below                          |
| `@types/proper-lockfile`         | 4.1.4    | 4.1.4      | no         | 2025-08-03     | 1.2 M                    | MIT        | 1            | goes with the above                              |
| `@types/bun`                     | 1.4.1    | **1.4.2**  | no         | 2026-09-08     | 11.2 M                   | MIT        | 1            | **bump** (match Bun 1.4.2)                       |
| `esbuild` (override)             | 0.28.2   | 0.28.2     | no         | 2026-08-08     | 242.4 M                  | MIT        | 0            | **keep**                                         |

### Sandbox image dependencies (`images/agent/**`)

| Package                          | Pinned  | Latest    | Deprecated | Last publish | Weekly | Verdict  |
| -------------------------------- | ------- | --------- | ---------- | ------------ | ------ | -------- |
| `@playwright/mcp`                | 0.0.80  | 0.0.80    | no         | 2026-09-01   | 6.4 M  | **keep** |
| `chrome-devtools-mcp`            | 1.8.0   | **1.9.0** | no         | 2026-09-08   | 1.5 M  | **bump** |
| `opencode-ai`                    | 1.18.29 | 1.18.29   | no         | 2026-09-08   | 1.9 M  | **keep** |
| `@google/gemini-cli`             | 0.58.0  | 0.58.0    | no         | 2026-09-08   | 271 k  | **keep** |
| `@agentclientprotocol/codex-acp` | 1.10.0  | 1.10.0    | no         | 2026-09-04   | 2.0 M  | **keep** |

Non-npm pins: `alpine:3.24.1@sha256:28bd5fe8…` — the digest was pulled and
`cat /etc/alpine-release` inside it printed **3.24.1**, so tag and digest agree.
`rust:1-alpine@sha256:a10e64dd…` for the RTK build stage. `rtk-ai/rtk` at revision `fde0a8f1…` —
repo not archived, pushed **2026-09-08**, 79.5 k stars, Apache-2.0. `claude-code=2.1.263-r1` from
Anthropic's apk repository with a pinned public-key hash. `hutch` at revision `5668321389…` from
`hutch.blackboard.sh` with a pinned SHA-256.

## The one dependency that fails the criteria

### `proper-lockfile@4.1.2` — abandoned

| Criterion                     | Finding                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Deprecated?                   | No — neither on npm nor in the README.                                             |
| Repository archived?          | No (`archived: false`, `disabled: false`).                                         |
| Last release                  | **2022-06-24** — 4 years and 2 months ago.                                         |
| Last commit                   | **2023-10-25** (`pushed_at`) — 2 years and 10 months ago.                          |
| Maintenance activity          | **21 open issues**, no releases in 4 years, no commits in almost 3.                |
| Community                     | 22.4 M weekly downloads, 286 GitHub stars. Popularity is inertia, not maintenance. |
| Transitive deps               | 3 (`graceful-fs`, `retry`, `signal-exit`).                                         |
| Types                         | `@types/proper-lockfile` (DefinitelyTyped), last published 2025-08-03.             |
| Known unfixed vulnerabilities | None reported by `bun audit`.                                                      |

It is used in three places — `packages/daemon/src/index.ts` (one daemon per state directory),
`apps/desktop/src/bun/lock.ts` (single desktop instance) and `packages/daemon/src/mirrors.ts`
(one git operation per mirror at a time). By the owner's stated rule ("stará knihovna bez commitu
za poslední rok není v pořádku ani když je populární") it has to go.

**Rejected replacements**, each with the criterion it failed:

| Candidate                  | Why rejected                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `lockfile` (npm)           | Unmaintained for longer than `proper-lockfile`; superseded by it.                                                           |
| `@napi-rs/lock`            | Does not exist on npm (404 in this session).                                                                                |
| `async-lock`, `async-sema` | In-process mutexes only; they cannot exclude a second OS process, which is the whole point of the desktop and daemon locks. |
| `lefthook`, `get-port`     | Solve different problems (git hooks, port discovery).                                                                       |

**Recommendation (implemented in Wave 3):** drop the dependency and use the primitives Bun and the OS
already give us, each matched to what the lock is actually for:

- **Daemon and desktop single-instance:** `fs.mkdir(dir)` is atomic and fails with `EEXIST` on every
  POSIX and Windows filesystem; combined with the pid already written to `daemon.json` and a staleness
  check, that is exactly what `proper-lockfile` does, in ~25 lines we own, with no dependency.
- **Mirror serialisation:** the mirrors are only ever touched by the one daemon process that owns the
  state directory (guaranteed by the daemon lock above), so an in-process `Map<string, Promise>` keyed by
  mirror path is both sufficient and strictly stronger than an advisory file lock — it cannot go stale.

This removes 2 dependencies (`proper-lockfile`, `@types/proper-lockfile`) and 3 transitive ones.

## Watch items (kept, but not at the top of their game)

- **`bun-plugin-tailwind@0.1.2`** — last published 2025-10-09 (11 months). Maintained by the Bun core
  team (`jarred`, `zackradisic`, `donisaac`) and published from the `tailwindlabs/tailwindcss`
  repository (`packages/@tailwindcss-bun`), 221 k weekly downloads, 0 dependencies. It is a thin
  Bun-bundler plugin for Tailwind 4 and it demonstrably works with `tailwindcss@4.3.3` (the UI builds and
  the theme renders). Kept; if it ever falls behind Tailwind, the escape hatch is
  `@tailwindcss/cli` as a pre-step, ~10 lines in `scripts/ui-build.ts`.
- **`tinyqueue@3.0.0`** — last published 2024-07-06, but the repository is alive (pushed 2026-04-05,
  3 open issues, single but responsive maintainer — Volodymyr Agafonkin). It is a 40-line binary heap
  with no dependencies used by the A* in `packages/sim/src/grid.ts`; there is nothing to rot. Kept.

## Candidates evaluated and their verdicts

All figures from the same registry sweep on 2026-09-08.

| Candidate                            | v                           | Last publish                         | Weekly                  | Verdict                                                                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------- | ------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yoctocolors`                        | 2.2.0                       | 2026-07-26                           | 34.5 M                  | **ADD** (Wave 6) — 0 deps, ESM, actively released; picked over `picocolors` (1.1.1, last publish 2024-10-16) precisely on the activity criterion.                                                                                                          |
| `@clack/prompts`                     | 1.8.0                       | 2026-09-07                           | 20.4 M                  | **rejected** — the finding it was to fix (B5.4, Ctrl-C leaving echo off) proved false when measured: Bun restores the terminal's termios on exit and on `SIGINT`. Four transitive dependencies for one working 16-line prompt. See the ADR 005 correction. |
| `picocolors`                         | 1.1.1                       | 2024-10-16                           | 202.5 M                 | rejected — 23 months without a release; `yoctocolors` does the same job and is maintained.                                                                                                                                                                 |
| `cli-table3`                         | 0.6.5                       | 2024-05-12                           | 23.3 M                  | rejected — 28 months without a release; the CLI's tables are five `padEnd` call sites, not worth an unmaintained dependency.                                                                                                                               |
| `ora` / `yocto-spinner`              | 9.4.1 / 1.2.2               | 2026-06-22 / 2026-07-16              | 79.8 M / 7.9 M          | rejected — the only long operation (`ho image build`) already streams build output line by line; a spinner would fight it.                                                                                                                                 |
| `neverthrow`                         | 8.2.0                       | 2025-02-21                           | 2.5 M                   | rejected — 19 months without a release, and it would replace 5 lines (`packages/core/src/result.ts`) with a class hierarchy. Own implementation kept deliberately.                                                                                         |
| `ts-pattern`                         | 5.9.0                       | 2025-10-26                           | 5.8 M                   | rejected — 11 months quiet, and `switch` with `switch-exhaustiveness-check` already gives exhaustive matching with zero runtime cost.                                                                                                                      |
| `es-toolkit`                         | 1.52.0                      | 2026-09-07                           | 43.7 M                  | rejected — actively maintained and would qualify, but the codebase's collection work is native (`toSorted`, `Map`, `Set`); nothing to delete.                                                                                                              |
| `remeda`                             | 2.47.0                      | 2026-09-07                           | 7.5 M                   | rejected — same reason.                                                                                                                                                                                                                                    |
| `uuid`                               | 14.0.2                      | 2026-08-18                           | 254.8 M                 | rejected — has `v7()`, but `packages/core` injects `Clock` and `Randomness` so the whole domain replays deterministically; taking a library that reaches for ambient crypto would break that property to delete 20 lines.                                  |
| `it-pushable`                        | 3.2.4                       | 2026-05-08                           | 286 k                   | rejected — 286 k weekly is thin, and it does not implement the bounded-capacity back-pressure behaviour `createChannel` needs (drop and fail the consumer).                                                                                                |
| `commander`                          | 15.0.0                      | 2026-09-02                           | 451.1 M                 | **candidate, see ADR 006** — 0 deps, generates `--help`, would delete the hand-maintained `USAGE` string.                                                                                                                                                  |
| `citty`                              | 0.2.2                       | 2026-08-20                           | 27.5 M                  | **candidate, see ADR 006** — unjs, 0 deps, TypeScript-first, but pre-1.0.                                                                                                                                                                                  |
| `cac`                                | 7.0.0                       | 2026-02-27                           | 44.0 M                  | rejected in ADR 006 — 6 months quiet and no advantage over `commander`.                                                                                                                                                                                    |
| `gunshi`                             | 0.37.2                      | 2026-09-06                           | 84 k                    | rejected — 84 k weekly is too thin for a load-bearing CLI.                                                                                                                                                                                                 |
| `stricli`                            | 1.1.8                       | 2025-04-26                           | **4**                   | rejected — 4 downloads a week.                                                                                                                                                                                                                             |
| `clipanion`                          | 4.0.0-rc.4                  | 2024-09-06                           | 3.4 M                   | rejected — release candidate untouched for 2 years.                                                                                                                                                                                                        |
| `syncpack` / `sherif`                | 15.3.3 / 1.13.0             | 2026-08-09 / 2026-07-04              | 1.7 M / 325 k           | rejected — both police version drift across workspaces, which Bun's `catalog:` already makes impossible here (every shared version is declared once).                                                                                                      |
| `taze`                               | 21.1.0                      | 2026-08-14                           | 64 k                    | rejected — Dependabot already opens grouped weekly updates for all five ecosystems.                                                                                                                                                                        |
| `publint`                            | 0.3.24                      | 2026-08-19                           | 1.1 M                   | rejected — checks published package shape; every workspace here is `private: true` and nothing is published.                                                                                                                                               |
| `lefthook`                           | 2.1.12                      | 2026-08-28                           | 3.9 M                   | rejected — the existing hook is `set -e; bun run check`; a hook manager would add config and a binary for no behaviour change.                                                                                                                             |
| `type-fest`                          | 5.9.0                       | 2026-08-30                           | 337.8 M                 | **ADD** (Wave 1) — replaces the hand-written `DistributiveOmit` in `packages/protocol/src/events.ts` and types the `compact()` helper that removes 62 spread guards.                                                                                       |
| `exit-hook`                          | 5.1.0                       | 2026-02-04                           | 8.8 M                   | rejected — `apps/cli/src/commands/daemon.ts` already installs SIGINT/SIGTERM handlers; a library adds nothing.                                                                                                                                             |
| `tinyexec` / `execa`                 | 1.3.1 / 10.0.1              | 2026-09-03 / 2026-07-31              | 119.5 M / 150.6 M       | rejected — `Bun.spawn` and `Bun.$` are first-party, already used consistently, and support the `unix:` socket and `timeout` options these wrappers do not.                                                                                                 |
| `tinyglobby`                         | 0.2.17                      | 2026-05-30                           | —                       | rejected — `Bun.Glob` is built in and already used.                                                                                                                                                                                                        |
| `nanoid`                             | 6.0.1                       | 2026-08-07                           | 214.3 M                 | rejected — ids must be time-ordered UUIDv7 for the event log; nanoid is neither.                                                                                                                                                                           |
| `valibot` / `arktype` / `effect`     | 1.4.2 / 2.2.3 / 3.22.1      | 2026-06-28 / 2026-07-07 / 2026-08-25 | 16.8 M / 1.5 M / 28.5 M | rejected — Zod 4 is the schema layer of the oRPC contract; swapping it would touch every boundary for no benefit.                                                                                                                                          |
| `pixi-viewport`                      | 6.0.3                       | 2024-11-27                           | 90 k                    | rejected — 22 months quiet, and the camera it would replace is 15 lines in `scene.ts#fit`.                                                                                                                                                                 |
| `@pixi/tilemap`                      | 5.0.2                       | 2025-07-14                           | 2.9 k                   | rejected — 2.9 k weekly, and the floor/wall painting it would replace is deliberately run-length batched and cached as one texture.                                                                                                                        |
| `phaser`                             | 4.2.1                       | 2026-07-09                           | 293.8 k                 | rejected in ADR 002.                                                                                                                                                                                                                                       |
| `excalibur` / `kaplay` / `melonjs`   | 0.32.0 / 3001.0.19 / 20.3.0 | 2026-09-07 / 2026-05-12 / 2026-08-31 | 8.7 k / 6.7 k / 0.8 k   | rejected in ADR 002 — adoption far too thin for a load-bearing renderer.                                                                                                                                                                                   |
| `koota` / `bitecs` / `miniplex`      | 0.6.6 / 0.4.0 / 2.0.0       | 2026-09-08 / 2025-12-06 / 2023-07-16 | 12.8 k / 11.2 k / 7.1 k | rejected in ADR 002 — an ECS pays off in the thousands of entities; this office runs ~30 actors on one floor.                                                                                                                                              |
| `matter-js` / `planck-js` / `howler` | —                           | —                                    | —                       | N/A — no physics and no audio in the product. `planck-js` is additionally **deprecated** ("use 'planck' instead").                                                                                                                                         |

## Net dependency change from this audit

**Added:** `type-fest` (dev, root — types only, erased at runtime), `yoctocolors` (`@ho/cli`).
**Removed:** `proper-lockfile`, `@types/proper-lockfile`.
**Bumped:** `knip` 6.34.0 → 6.35.0 and `@types/bun` 1.4.1 → 1.4.2 (Wave 5); `chrome-devtools-mcp` 1.8.0 → 1.9.0 in the sandbox MCP tree — recorded here after Wave 5 but only actually applied in Wave 7, when checking this line against the manifest found it still pinned to 1.8.0. The agent image was rebuilt for it and `npm audit` is clean.

## Added 2026-09-10 — localisation

Checked with the same requests as the sweep above, on 2026-09-10.

| Package         | Pinned  | Latest  | Deprecated | Last publish | Weekly | Licence | Runtime deps | Verdict  |
| --------------- | ------- | ------- | ---------- | ------------ | ------ | ------- | ------------ | -------- |
| `i18next`       | 26.4.2  | 26.4.2  | no         | 2026-09-03   | 19.7 M | MIT     | 0            | **keep** |
| `react-i18next` | 17.0.13 | 17.0.13 | no         | 2026-09-01   | 14.3 M | MIT     | 3            | **keep** |

`react-i18next`'s three are `@babel/runtime`, `html-parse-stringify` (its `<Trans>` parser) and
`use-sync-external-store`. `github.com/i18next/react-i18next`: not archived, last push 2026-09-03.
Peer ranges cover this tree — `typescript ^5 || ^6 || ^7` against TypeScript 7.0.2, react `>= 16.8.0`
against 19.2.8, and `i18next >= 26.2.0` against 26.4.2.
