# Coverage matrix

One row per point from §9 of the brief. Allowed states: `NEZAČATO` → `AUDITOVÁNO` → `ROZHODNUTO` →
`IMPLEMENTOVÁNO` → `OVĚŘENO`, or `N/A` with a fact from the repository as justification.

**No row is `N/A`.** Every point in A1–A4, B1–B33 and C1–C5 turned out to apply to this repository, so each
has either a finding or an explicit "verified, no change needed" entry stating what was checked.

Updated: end of Wave 6.

Wave 6 added three findings and refuted two claims of its own. New: **B5.6** (every bad CLI argument
printed a JSON dump of Zod issues), **B6.7** (a tab whose token the daemon rejects reconnected every 2 s
for as long as it stayed open — 393 warn lines in the daemon log during this wave's own checks) and
**B21.4** (the daemon's own log file had no size bound; B21.3's "log rotation" credit was the sandboxes'
Docker logs). Refuted: **B5.4 is withdrawn** — measured under a pty, Bun restores the terminal's termios
from both `atexit` and its own `SIGINT` handler, so `stty -echo` cannot leak to the shell, and
`@clack/prompts` is not adopted (ADR 005 corrected) — and **B6.3's second claim was wrong**: the `chunk`
naming is what names an HTML entrypoint's JS and CSS, and splitting PixiJS out was measured to buy nothing
because the office canvas is the first view.

Wave 3 added three more findings and withdrew one recommendation: **B24.3** (the image content hash
matched no files from the build context, so editing a Dockerfile never rebuilt the image — Bun's `Glob`
returns nothing for a brace group crossing a path separator), **B5.5** (a failed build reached the CLI as
"Internal server error"), **B6.6**/**B29.5** from Wave 2, and **B16.1 is withdrawn**: measured byte for
byte, sharp's `extract`/`extend` equal ours but `trim` does not equal `opaqueBounds`.

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

| ID  | Bod                              | Stav       | Prošlé soubory                                                                                  | Nálezy                                  | Poznámka                                                                                                            |
| --- | -------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A1  | Configuration files              | OVĚŘENO    | all 30 config files in `INVENTORY.md` §3                                                        | A1.1–A1.8                               | A1.6 measured flag by flag in Wave 5: two were off for nothing and are back on                                      |
| A2  | GitHub Actions CI/CD             | ROZHODNUTO | `.github/workflows/{ci,release}.yml`, `dependabot.yml`                                          | A2.1–A2.3, **A2.5**, **A2.6**, **A2.7** | A2.1 job added but only CI itself can run it; everything else verified locally                                      |
| A3  | Markdown accuracy                | ROZHODNUTO | all 23 tracked `.md`                                                                            | A3.1, A3.2                              | A3.2 done in Wave 2 (report moved to `docs/history/`); the A3.1 rewrite is Wave 7                                   |
| A4  | Bun setup                        | OVĚŘENO    | `package.json`, `bunfig.toml`, `bun.lock`, both workflows, `images/agent/Dockerfile`            | A4.2, A4.3                              | A4.1: 27/30 catalog entries latest; frozen install reproduces. Both findings done in Wave 1                         |
| B1  | Change directory structures      | OVĚŘENO    | every workspace tree                                                                            | B1.1–B1.3, **B1.4**                     | all four done; B1.2's bundle claim corrected with a measurement                                                     |
| B2  | Refactor code                    | OVĚŘENO    | all 200 source files                                                                            | see B12, B15, B29                       | umbrella point: every concrete item under those IDs is done                                                         |
| B3  | Simplify code                    | OVĚŘENO    | all 200 source files                                                                            | B15.1–B15.4                             | all four done and verified in Wave 2                                                                                |
| B4  | More effective architecture      | OVĚŘENO    | `core/model/**`, `daemon/**`                                                                    | B4.1–B4.3                               | indexes, bounded chat and one MCP server per session, all verified live                                             |
| B5  | CLI environment                  | OVĚŘENO    | all 22 `apps/cli` files                                                                         | B5.1–B5.4, **B5.5**, **B5.6**           | all done in Wave 6; B5.4 withdrawn (Bun restores the terminal itself) and B5.6 found by measuring                   |
| B6  | UI environment                   | OVĚŘENO    | all 40 `packages/ui` files                                                                      | B6.1–B6.5, **B6.6**, **B6.7**           | all done; B6.3's premise refuted by measurement, B6.7 found while verifying this wave                               |
| B7  | Modernise code                   | ROZHODNUTO | all 200 source files                                                                            | see B29, B22, B25                       | B29.1–B29.3, B29.5 and B22.1–B22.3 done; B25 items → Wave 5                                                         |
| B8  | Rename files                     | OVĚŘENO    | every file name in the tree                                                                     | B13.2 (`keychain.ts`)                   | renamed to `os-credential-store.ts` in Wave 6, with the factory and the store kind                                  |
| B9  | Change code architecture         | OVĚŘENO    | `core/ports.ts`, `sandbox-docker/**`, `sim/**`                                                  | B9.1, B9.2                              | both port-boundary leaks closed                                                                                     |
| B10 | Optimise flow                    | OVĚŘENO    | `daemon/{scheduler,office-gate,intake}.ts`                                                      | B10.1, B10.2                            | the 2 s heartbeat is gone (verified: a session starts on the event) and the gate is bounded                         |
| B11 | Optimise performance             | OVĚŘENO    | `daemon/usage.ts`, `store/event-store.ts`, `ui/office/plan-view.ts`                             | B11.1–B11.3                             | no event-log scan, no double filter, no per-frame array in the renderer                                             |
| B12 | More readable code               | OVĚŘENO    | all 200 source files                                                                            | B12.1                                   | the four comments now sit on the functions they describe                                                            |
| B13 | Accurate naming                  | OVĚŘENO    | all exported identifiers                                                                        | B13.1–B13.5                             | B13.1–B13.3 done in Wave 6: provider-state volumes, the OS credential store, one ACP prompt = one turn              |
| B14 | Deduplicate                      | OVĚŘENO    | all 200 source files                                                                            | B14.1–B14.4, B18.4, B18.5               | B14.1–B14.4 done in Wave 2; the two `sim` duplications are Wave 4                                                   |
| B15 | Remove needless complexity       | OVĚŘENO    | all 200 source files                                                                            | B15.1–B15.4                             | 63 spread guards → `compact()`; parseArgs `multiple`; dead lines gone                                               |
| B16 | Replace our logic with libraries | OVĚŘENO    | `scripts/lib/**`, `core/**`, three lock sites                                                   | B16.1–B16.3                             | B16.2, B16.3 done; **B16.1 withdrawn on measurement** — sharp's trim is not our opaqueBounds                        |
| B17 | Use an alternative library       | OVĚŘENO    | all 35 declared dependencies                                                                    | B16.3 (`proper-lockfile`)               | replaced by a directory lock and an in-process chain; 5 packages fewer                                              |
| B18 | Optimise game mechanics          | OVĚŘENO    | all 17 `packages/sim` files                                                                     | B18.1–B18.5                             | occupancy index measured 2.7–16× faster; the five neighbour tables are one                                          |
| B19 | Optimise the build               | OVĚŘENO    | `scripts/**`, `package.json`, both workflows                                                    | B19.1                                   | `check` now builds the UI too, so the hook and CI agree; B19.2 records the good parts                               |
| B20 | Improve security                 | OVĚŘENO    | `daemon/{server,static,auth}.ts`, `sandbox-docker/**`, `secrets/**`, both Dockerfiles           | B20.1–B20.4                             | constant-time token, 0600 database, encoded volume paths, egress documented as accepted                             |
| B21 | Lower RAM/CPU                    | OVĚŘENO    | `sim/**`, `daemon/**`, `images/agent/Dockerfile`                                                | B21.1, B21.2, **B21.4**, B10.2, B4.2    | B21.4 in Wave 6: the daemon's own log now rotates at 8 MiB; B21.3's credit was the containers' logs                 |
| B22 | Type safety with modern TS       | OVĚŘENO    | `tsconfig*.json`, `core/**`, `protocol/**`                                                      | B22.1–B22.3                             | SecretKeyName, MailItemId, type-fest; B22.4 records zero escapes, still true                                        |
| B23 | Optimise monorepo setup          | OVĚŘENO    | `package.json`, `bunfig.toml`, `knip.json`, 16 tsconfigs                                        | B23.1, A1.4, A1.5                       | all three done and verified in Wave 1; B23.2 records catalog + isolated linker as good                              |
| B24 | Dockerfile and build             | ROZHODNUTO | both Dockerfiles, both `.dockerignore`, `devkit.ts`                                             | B24.1, B24.2, **B24.3**, B21.2          | B24.1(a), B24.2, B24.3 done; **B24.1(b)** (the ~900 MB browser split) deliberately not done — reasoning in AUDIT.md |
| B25 | Experimental features            | OVĚŘENO    | `ui/panels/add-project.tsx`, `secrets/**`, `scripts/ui-build.ts`, `apps/desktop/**`             | B25.1–B25.5                             | each keep states its reversal cost; B25.5 (`ultracode`) deliberately omitted; B25.3 note → Wave 7                   |
| B26 | Stricter, non-misleading rules   | ROZHODNUTO | `.oxlintrc.json`, `tsconfig.base.json`                                                          | A1.1–A1.3, A1.4, A1.6                   | 9 rules added in Wave 1 (4 rejected with reasons); A1.6 desktop flags → Wave 5                                      |
| B27 | Add missing tools                | OVĚŘENO    | whole toolchain                                                                                 | B27.1, B27.2                            | B27.1 daemon smoke check added and it caught the A2.5 blocker; B27.2: no tool gap                                   |
| B28 | Remove dead code and files       | ROZHODNUTO | all 615 tracked files + working tree                                                            | B28.1, B28.2, A1.8, A3.2                | B28.2 and A3.2 done in Wave 2; B28.1 was the artefact deleted in Wave 1                                             |
| B29 | Most modern patterns             | ROZHODNUTO | `ui/**`, `daemon/**`, `core/**`                                                                 | B29.1–B29.3, **B29.5**                  | B29.1–B29.3 and B29.5 done; B29.4 records the event-sourcing core as sound                                          |
| B30 | Optimise protocols               | OVĚŘENO    | `protocol/**`, `runtime-acp/**`, `daemon/{server,rpc}/**`, installed ACP SDK types              | B30.1–B30.4                             | ACP context/cost is no longer dropped; SDK PROTOCOL_VERSION; the boundary event reaches the bridge                  |
| B31 | External tools (DB, Docker, …)   | OVĚŘENO    | `store/**`, `sandbox-docker/**`, `intake-github/**`, `daemon/{publish,mirrors,repo-inspect}.ts` | B31.2, B31.3, **B24.3**                 | empty label filter, indexed dedupe, and the image hash fix from Wave 3                                              |
| B32 | Verify config correctness        | ROZHODNUTO | every config file                                                                               | A1, A2, A4, B24, B33                    | every file in `INVENTORY.md` §3 has a finding or a verified entry                                                   |
| B33 | AI config, cost, reasoning       | OVĚŘENO    | `runtime-claude-code/**`, `protocol/providers.ts`, `images/agent/**`, `daemon/prompts.ts`       | B33.1–B33.6                             | settings re-verified against the live docs today, then exercised by a real session                                  |
| C1  | Framework migration?             | ROZHODNUTO | whole tree, 5 options                                                                           | `adr/001-framework-migration.md`        | **No migration.** Effect rejected on scope, not merit                                                               |
| C2  | Is PixiJS the best engine?       | ROZHODNUTO | `sim/**`, `ui/office/**`, 15 npm candidates                                                     | `adr/002-render-engine.md`              | **Keep PixiJS 8** — no v9 exists, latest is 8.20.1                                                                  |
| C3  | Working with sprite files        | ROZHODNUTO | `assets/**`, `scripts/{assets-*,lib}/**`, `ui/office/sprites.ts`                                | `adr/003-sprite-pipeline.md`            | keep the pipeline; `sharp` for exact ops; add an atlas                                                              |
| C4  | What in the setup holds up?      | ROZHODNUTO | whole tree + 35 dependencies                                                                    | `adr/004-stack-review.md`               | 12 choices hold, 5 do not, plus 2 unfinished                                                                        |
| C5  | Where could a library help?      | ROZHODNUTO | all self-written machinery, 43 candidates                                                       | `adr/005-library-candidates.md`         | 8 adopt (4 need no new dependency), 12 keep ours                                                                    |

## Wave plan mapped to points

| Wave                      | Points                                                                                                             | Status             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 1 — foundation            | A1.1–A1.5, A1.7, A1.8, A2.2, A2.3, **A2.5**, A4.2, A4.3, **B1.4**, B16.2, B22.3, B23.1, B26 (9 rules), B27.1       | **done, verified** |
| 2 — hygiene               | A3.2, B12.1, B13.4, B13.5, B14.1–B14.4, B15.1–B15.4, B28.2, **B1.1**, **B6.1**, **B6.6**, **B29.5**, A2.3 (fix)    | **done, verified** |
| 3 — architecture          | B1.2, B1.3, B4.1–B4.3, B9.1, B9.2, B11.1, B16.1 (withdrawn), B16.3, B22.1, B22.2, B29.1–B29.3, **B24.3**, **B5.5** | **done, verified** |
| 4 — runtime and protocols | B6.2, B10.1, B10.2, B11.2, B11.3, B18.1–B18.5, B21.1, B30.1–B30.4, B31.2, B31.3                                    | **done, verified** |
| 5 — infrastructure        | A1.6, A2.1, **A2.6**, **A2.7**, B19.1, B20.1–B20.4, B21.2, B24.1(a), B24.2, B33.1–B33.6                            | **done, verified** |
| 6 — DX and UI             | B5.1–B5.4, **B5.6**, B6.3, B6.5, **B6.7**, B13.1–B13.3, **B21.4**                                                  | **done, verified** |
| 7 — documentation         | A3.1, A3.3                                                                                                         | not started        |
