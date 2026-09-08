# Coverage matrix

One row per point from §9 of the brief. Allowed states: `NEZAČATO` → `AUDITOVÁNO` → `ROZHODNUTO` →
`IMPLEMENTOVÁNO` → `OVĚŘENO`, or `N/A` with a fact from the repository as justification.

**No row is `N/A`.** Every point in A1–A4, B1–B33 and C1–C5 turned out to apply to this repository, so each
has either a finding or an explicit "verified, no change needed" entry stating what was checked.

Updated: end of Wave 2.

Wave 2 added three findings Phase 1 had missed — **A2.6** (a self-compiled `ho` cannot serve the UI and its
`doctor` returns 500), **B6.6** (a hidden document silences every UI update) and **B29.5** (unexpected RPC
failures were logged nowhere) — and corrected four claims: A2.3's guard as written in Wave 1 would have
failed CI, A2.5's impact line overstated who is affected, B15.1's count was 62 rather than 63, and B14.3
counted four copies of a rule where only three are the same rule. Every correction is in `AUDIT.md` beside
the original finding.

Wave 1 changed two rows' evidence: **A1.3's claim that all nine new lint rules were already satisfied was
wrong** (three had real hits), and enabling them surfaced two findings Phase 1 had missed — a dependency
cycle in `@ho/core` (**B1.4**) and a **blocker**: the compiled `ho` binary could not start the daemon at
all (**A2.5**). Both are now in `AUDIT.md` with the correction, and both are fixed. A1.6 (desktop
strictness flags) stays in Wave 5 as planned.

| ID  | Bod                              | Stav       | Prošlé soubory                                                                                  | Nálezy                           | Poznámka                                                                                         |
| --- | -------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| A1  | Configuration files              | ROZHODNUTO | all 30 config files in `INVENTORY.md` §3                                                        | A1.1–A1.8                        | A1.1–A1.5, A1.7, A1.8 done and verified in Wave 1; A1.6 → Wave 5                                 |
| A2  | GitHub Actions CI/CD             | ROZHODNUTO | `.github/workflows/{ci,release}.yml`, `dependabot.yml`                                          | A2.1–A2.3, **A2.5**, **A2.6**    | A2.2, A2.3 (corrected in Wave 2) and A2.5 verified; A2.1 and the new A2.6 → Wave 5               |
| A3  | Markdown accuracy                | ROZHODNUTO | all 23 tracked `.md`                                                                            | A3.1, A3.2                       | A3.2 done in Wave 2 (report moved to `docs/history/`); the A3.1 rewrite is Wave 7                |
| A4  | Bun setup                        | OVĚŘENO    | `package.json`, `bunfig.toml`, `bun.lock`, both workflows, `images/agent/Dockerfile`            | A4.2, A4.3                       | A4.1: 27/30 catalog entries latest; frozen install reproduces. Both findings done in Wave 1      |
| B1  | Change directory structures      | ROZHODNUTO | every workspace tree                                                                            | B1.1–B1.3, **B1.4**              | B1.1 and B1.4 done; B1.2, B1.3 → Wave 3                                                          |
| B2  | Refactor code                    | ROZHODNUTO | all 200 source files                                                                            | see B12, B15, B29                | umbrella point; concrete items live under those IDs                                              |
| B3  | Simplify code                    | OVĚŘENO    | all 200 source files                                                                            | B15.1–B15.4                      | all four done and verified in Wave 2                                                             |
| B4  | More effective architecture      | ROZHODNUTO | `core/model/**`, `daemon/**`                                                                    | B4.1, B4.2, B4.3                 | B29.4 records the event-sourcing core as verified sound                                          |
| B5  | CLI environment                  | ROZHODNUTO | all 22 `apps/cli` files                                                                         | B5.1–B5.4                        | decision in `adr/006-cli-framework.md`                                                           |
| B6  | UI environment                   | ROZHODNUTO | all 40 `packages/ui` files                                                                      | B6.1–B6.5, **B6.6**              | B6.1 and the new B6.6 fixed in Wave 2 (office renders while hidden); B6.2–B6.5 → Waves 4 and 6   |
| B7  | Modernise code                   | ROZHODNUTO | all 200 source files                                                                            | see B29, B22, B25                | nothing is written in an outdated style; findings are about unused modern facilities             |
| B8  | Rename files                     | ROZHODNUTO | every file name in the tree                                                                     | B13.2 (`keychain.ts`)            | the one misleading file name; rename in Wave 6                                                   |
| B9  | Change code architecture         | ROZHODNUTO | `core/ports.ts`, `sandbox-docker/**`, `sim/**`                                                  | B9.1, B9.2                       | port/adapter boundary leaks in two places                                                        |
| B10 | Optimise flow                    | ROZHODNUTO | `daemon/{scheduler,office-gate,intake}.ts`                                                      | B10.1, B10.2                     | scheduler polls despite already being event-driven                                               |
| B11 | Optimise performance             | ROZHODNUTO | `daemon/usage.ts`, `store/event-store.ts`, `ui/office/plan-view.ts`                             | B11.1–B11.3                      | B11.1 is the worst: a full history scan every 10 s                                               |
| B12 | More readable code               | OVĚŘENO    | all 200 source files                                                                            | B12.1                            | the four comments now sit on the functions they describe                                         |
| B13 | Accurate naming                  | ROZHODNUTO | all exported identifiers                                                                        | B13.1–B13.5                      | B13.4 and B13.5 done in Wave 2 (one version from HO_RELEASE_VERSION); B13.1–B13.3 → Wave 6       |
| B14 | Deduplicate                      | OVĚŘENO    | all 200 source files                                                                            | B14.1–B14.4, B18.4, B18.5        | B14.1–B14.4 done in Wave 2; the two `sim` duplications are Wave 4                                |
| B15 | Remove needless complexity       | OVĚŘENO    | all 200 source files                                                                            | B15.1–B15.4                      | 63 spread guards → `compact()`; parseArgs `multiple`; dead lines gone                            |
| B16 | Replace our logic with libraries | ROZHODNUTO | `scripts/lib/**`, `core/**`, three lock sites                                                   | B16.1–B16.3                      | B16.2 done in Wave 1; B16.1, B16.3 → Wave 3. Four deliberate keeps in B16.4, survey in `adr/005` |
| B17 | Use an alternative library       | ROZHODNUTO | all 35 declared dependencies                                                                    | B16.3 (`proper-lockfile`)        | 43 candidates evaluated in `DEPENDENCIES.md`                                                     |
| B18 | Optimise game mechanics          | ROZHODNUTO | all 17 `packages/sim` files                                                                     | B18.1–B18.5                      | B18.1 is O(N²) `Set` construction per frame                                                      |
| B19 | Optimise the build               | ROZHODNUTO | `scripts/**`, `package.json`, both workflows                                                    | B19.1                            | B19.2 records the staged UI publish and content hashing as good                                  |
| B20 | Improve security                 | ROZHODNUTO | `daemon/{server,static,auth}.ts`, `sandbox-docker/**`, `secrets/**`, both Dockerfiles           | B20.1–B20.4                      | B20.5 records the credential path and CSP as verified good                                       |
| B21 | Lower RAM/CPU                    | ROZHODNUTO | `sim/**`, `daemon/**`, `images/agent/Dockerfile`                                                | B21.1, B21.2, B10.2, B4.2        | B21.3 records channels, limits and WAL tuning as good                                            |
| B22 | Type safety with modern TS       | ROZHODNUTO | `tsconfig*.json`, `core/**`, `protocol/**`                                                      | B22.1–B22.3                      | B22.3 done in Wave 1; B22.4: zero `any`/`@ts-ignore`/non-null in 20 121 lines                    |
| B23 | Optimise monorepo setup          | OVĚŘENO    | `package.json`, `bunfig.toml`, `knip.json`, 16 tsconfigs                                        | B23.1, A1.4, A1.5                | all three done and verified in Wave 1; B23.2 records catalog + isolated linker as good           |
| B24 | Dockerfile and build             | ROZHODNUTO | both Dockerfiles, both `.dockerignore`, `devkit.ts`                                             | B24.1, B24.2, B21.2              | image is 1.76 GB, 837 MB of it one apk layer                                                     |
| B25 | Experimental features            | ROZHODNUTO | `ui/panels/add-project.tsx`, `secrets/**`, `scripts/ui-build.ts`, `apps/desktop/**`             | B25.1–B25.5                      | each entry states the reversal cost, as required                                                 |
| B26 | Stricter, non-misleading rules   | ROZHODNUTO | `.oxlintrc.json`, `tsconfig.base.json`                                                          | A1.1–A1.3, A1.4, A1.6            | 9 rules added in Wave 1 (4 rejected with reasons); A1.6 desktop flags → Wave 5                   |
| B27 | Add missing tools                | OVĚŘENO    | whole toolchain                                                                                 | B27.1, B27.2                     | B27.1 daemon smoke check added and it caught the A2.5 blocker; B27.2: no tool gap                |
| B28 | Remove dead code and files       | ROZHODNUTO | all 615 tracked files + working tree                                                            | B28.1, B28.2, A1.8, A3.2         | B28.2 and A3.2 done in Wave 2; B28.1 was the artefact deleted in Wave 1                          |
| B29 | Most modern patterns             | ROZHODNUTO | `ui/**`, `daemon/**`, `core/**`                                                                 | B29.1–B29.3, **B29.5**           | B29.5 (RPC errors were never logged) fixed in Wave 2; B29.1–B29.3 → Waves 3 and 4                |
| B30 | Optimise protocols               | ROZHODNUTO | `protocol/**`, `runtime-acp/**`, `daemon/{server,rpc}/**`, installed ACP SDK types              | B30.1–B30.4                      | B30.1: ACP usage and cost dropped for 3 of 4 providers                                           |
| B31 | External tools (DB, Docker, …)   | ROZHODNUTO | `store/**`, `sandbox-docker/**`, `intake-github/**`, `daemon/{publish,mirrors,repo-inspect}.ts` | B31.2, B31.3                     | B31.1 and B31.4 record the API pin and subprocess discipline as good                             |
| B32 | Verify config correctness        | ROZHODNUTO | every config file                                                                               | A1, A2, A4, B24, B33             | every file in `INVENTORY.md` §3 has a finding or a verified entry                                |
| B33 | AI config, cost, reasoning       | ROZHODNUTO | `runtime-claude-code/**`, `protocol/providers.ts`, `images/agent/**`, `daemon/prompts.ts`       | B33.1–B33.6                      | checked against the live Claude Code CLI/settings/env references                                 |
| C1  | Framework migration?             | ROZHODNUTO | whole tree, 5 options                                                                           | `adr/001-framework-migration.md` | **No migration.** Effect rejected on scope, not merit                                            |
| C2  | Is PixiJS the best engine?       | ROZHODNUTO | `sim/**`, `ui/office/**`, 15 npm candidates                                                     | `adr/002-render-engine.md`       | **Keep PixiJS 8** — no v9 exists, latest is 8.20.1                                               |
| C3  | Working with sprite files        | ROZHODNUTO | `assets/**`, `scripts/{assets-*,lib}/**`, `ui/office/sprites.ts`                                | `adr/003-sprite-pipeline.md`     | keep the pipeline; `sharp` for exact ops; add an atlas                                           |
| C4  | What in the setup holds up?      | ROZHODNUTO | whole tree + 35 dependencies                                                                    | `adr/004-stack-review.md`        | 12 choices hold, 5 do not, plus 2 unfinished                                                     |
| C5  | Where could a library help?      | ROZHODNUTO | all self-written machinery, 43 candidates                                                       | `adr/005-library-candidates.md`  | 8 adopt (4 need no new dependency), 12 keep ours                                                 |

## Wave plan mapped to points

| Wave                      | Points                                                                                                          | Status             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1 — foundation            | A1.1–A1.5, A1.7, A1.8, A2.2, A2.3, **A2.5**, A4.2, A4.3, **B1.4**, B16.2, B22.3, B23.1, B26 (9 rules), B27.1    | **done, verified** |
| 2 — hygiene               | A3.2, B12.1, B13.4, B13.5, B14.1–B14.4, B15.1–B15.4, B28.2, **B1.1**, **B6.1**, **B6.6**, **B29.5**, A2.3 (fix) | **done, verified** |
| 3 — architecture          | B1.2, B1.3, B4.1–B4.3, B9.1, B9.2, B16.1, B16.3, B22.1, B22.2, B29.1–B29.3                                      | not started        |
| 4 — runtime and protocols | B6.2, B10.1, B10.2, B11.1–B11.3, B18.1–B18.5, B21.1, B30.1–B30.4, B31.2, B31.3                                  | not started        |
| 5 — infrastructure        | A1.6, A2.1, **A2.6**, B19.1, B20.1–B20.4, B21.2, B24.1, B24.2, B33.1–B33.6                                      | not started        |
| 6 — DX and UI             | B5.1–B5.4, B6.3–B6.5, B13.1, B13.2                                                                              | not started        |
| 7 — documentation         | A3.1, A3.3                                                                                                      | not started        |
