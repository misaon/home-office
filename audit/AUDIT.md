# Phase 1 — Audit

Read-only findings from a complete pass over every tracked source file (200 files, 20 121 lines) plus every
configuration file, workflow, Dockerfile and manifest listed in `audit/INVENTORY.md`. Nothing here is taken
on trust from the repository's own prose. External claims carry the URL and the date it was opened in this
session (all: **2026-09-08**).

Severities: `blocker` (breaks or corrupts), `high` (wrong behaviour, real cost, or a security weakness),
`medium` (maintainability or performance with a concrete cost), `low`, `nice-to-have`.

**Standing note on quality.** The baseline is unusually clean: zero `any`, zero `@ts-ignore`, zero
non-null assertions, zero TODO/FIXME, no unused dependencies, `bun run check` green, `bun audit` clean.
Most findings below are therefore about duplication, per-frame cost, misleading names, and configuration
that is out of date against the vendors' current documentation — not about broken code.

---

## A1 — Configuration files

### A1.1 – oxlint supports `overrides`, so four whole-file rule disables are unnecessary

Severita: medium
Kde: `.oxlintrc.json` (no `overrides` key); the disables at `packages/ui/src/office/architecture.ts:1`, `packages/ui/src/office/plan-view.ts:1`, `packages/ui/src/office/stand-ins.ts:1`, `packages/ui/src/office/walls.ts:1`
Důkaz: Each of the four files begins with `/* eslint-disable unicorn/no-array-fill-with-reference-type -- Pixi Graphics.fill takes a FillStyle, not an Array value. */`. The reason is correct — the rule misfires on PixiJS's `Graphics.fill(style)` because of the method name — but a file-level disable switches the rule off for the entire file, including any real `Array.fill` misuse. The installed `oxlint@1.82.0` configuration schema declares a top-level `overrides` property ("Add, remove, or otherwise reconfigure rules for specific files or groups of files"), read from `node_modules/oxlint/configuration_schema.json` in this session.
Dopad: Udržovatelnost: the suppression is broader than the problem and is repeated four times, so a genuine `Array.fill(sharedObject)` bug in any of those files would go unreported.
Doporučení: One `overrides` entry scoped to `packages/ui/src/office/*.ts` turning off that single rule, and delete all four comments.
Zdroj: `node_modules/oxlint/configuration_schema.json` (oxlint 1.82.0), verified 2026-09-08; also https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json
Odhad: triviální

### A1.2 – Two lint plugins with relevant rules are not enabled

Severita: low
Kde: `.oxlintrc.json:3` (`plugins`)
Důkaz: The config enables 8 of the schema's 15 plugins. Not enabled: `node` (11 rules) and `react-perf` (4 rules); also `jsdoc`, `jest`, `vitest`, `nextjs`, `vue`. Of these only `node` is applicable (the daemon, CLI, scripts and runner all use `node:*` APIs); `react-perf` was evaluated and **rejected** (see A1.3).
Dopad: DX: a small set of Node-specific correctness rules (`node/no-path-concat`, `node/no-sync`, `node/handle-callback-err`) is unused on code full of `node:path` and `node:fs` calls.
Doporučení: Add `node` to `plugins`.
Zdroj: oxlint 1.82.0 schema, rule inventory extracted in this session (870 rules, 15 plugins, 7 categories).
Odhad: triviální

### A1.3 – Nine strictness rules are available at zero cost; four others must stay off

Severita: medium
Kde: `.oxlintrc.json:11-90` (`rules`)
Důkaz: The `restriction` and `nursery` categories are off (correct) and `style` is off (correct — `oxfmt` owns formatting). Cross-checking the enabled set against the 870-rule schema shows nine rules the code **already satisfies**, which would therefore lock in existing discipline for free: `typescript/no-unsafe-type-assertion`, `typescript/no-unnecessary-type-assertion`, `typescript/no-deprecated`, `typescript/no-confusing-void-expression`, `typescript/explicit-function-return-type`, `typescript/consistent-type-exports`, `typescript/prefer-readonly`, `import/no-cycle`, `import/no-self-import`. The first matters most: `packages/core/src/commands/projects.ts:140` already carries an `oxlint-disable-next-line typescript/no-unsafe-type-assertion`, which today suppresses a rule that **is not switched on** — so the suppression is decorative and new `as` casts are unchecked.
Four candidates were rejected because they would force worse code: `react-perf/*` (would demand `useCallback`/`useMemo` around every inline JSX handler, which `reactCompiler: true` in `scripts/ui-build.ts:21` exists to make unnecessary), `typescript/promise-function-async` (would force `async` onto deliberately sync-returning port implementations such as `Office.execute`), `unicorn/no-null` (the domain deliberately distinguishes `null` from `undefined` — e.g. `TaskAssignInput.agentId: AgentId.nullable()`), and `oxc/no-barrel-file` (barrel `index.ts` files are the packages' public surface by design).
Dopad: Typová bezpečnost: an unchecked `as` cast can be introduced anywhere today. Udržovatelnost: `import/no-cycle` is the guard a 17-package monorepo wants and does not have.
Doporučení: Enable the nine; record the four rejections and why.
Zdroj: oxlint 1.82.0 schema; `scripts/ui-build.ts:21` for `reactCompiler`.
Odhad: střední

**Correction after Wave 1 (2026-09-08).** The claim "the code already satisfies all nine" was wrong for
three of them, which enabling the rules proved:

- `typescript/explicit-function-return-type` produced **30 hits**. The code annotates every _declaration_
  but not inline arrow expressions, a distinction I failed to make. Enabling it bare would have meant
  writing `: void` on 30 contextually-typed callbacks — exactly the "misleading strictness" the brief
  warns against. Resolved by enabling it with the rule's own `allowExpressions: true` option (measured:
  30 hits → 5) and annotating those five, which are exported functions with inferred return types and
  genuinely worth annotating.
- `typescript/consistent-type-exports` produced **4 hits**, all in `packages/core/src/index.ts` — fixed
  with `export type *` for the four type-only modules.
- `import/no-cycle` produced **2 hits** — a real cycle this audit had missed. See B1.4.

### B1.4 – A dependency cycle between `commands/chat.ts` and `commands/boss.ts`

Severita: medium
Kde: `packages/core/src/commands/chat.ts:5` ↔ `packages/core/src/commands/boss.ts:14` (baseline line numbers)
Důkaz: `chat.ts` imported `triageMessage` from `boss.ts`; `boss.ts` imported `titleFromText` from `chat.ts`. Found by enabling `import/no-cycle` in Wave 1, **not** by the Phase 1 reading — I read both files and did not notice. Recorded as a miss.
Dopad: Udržovatelnost: a cycle inside the pure domain package, invisible until a tool looked for it.
Doporučení: `titleFromText` is a generic text helper with no dependency on chat; move it to `commands/shared.ts`, which both files already import. Done in Wave 1.
Odhad: triviální

### A2.5 – The compiled `ho` binary could not start the daemon at all

Severita: **blocker**
Kde: `packages/store/src/database.ts:24-26` and `packages/daemon/src/paths.ts:27-28` at the audited baseline
Důkaz: `bun build --compile apps/cli/src/main.ts` produced a binary that died immediately with `ho: Can't find meta/_journal.json file`. Reproduced against the **baseline** commit's own binary, so it predates this audit. Cause: `defaultResourcesRoot()` is `resolve(import.meta.dir, "../../..")`, which inside a compiled executable resolves to a virtual path, so `resolveResources` reported `migrationsDir: null`; `openDatabase` then fell back to `fileURLToPath(new URL("../drizzle", import.meta.url))`, also virtual, and Drizzle's file-based migrator threw. Running from source and the packaged desktop app were both fine — the desktop passes `resourcesRoot` explicitly and `scripts/desktop-prepare.ts` copies the migrations — so only the shipped CLI binary was affected. Phase 1 missed this because it verified the daemon from source and the compiled binary only through `--help` and `doctor`; the CI smoke step added for A2.2 is what surfaced it.
Dopad: Anyone running the compiled `ho` — the artefact `ci.yml` builds — could not start a daemon.
**Correction (Wave 2):** the first version of this line also called it "the one a user would install". That is wrong: `release.yml` publishes only the macOS desktop app, and the desktop passes its own `resourcesRoot`. The compiled CLI is a CI build check and whatever a developer compiles locally, which is still worth fixing but is not the installed artefact.
Doporučení: Carry the migrations inside the executable. Done in Wave 1: `packages/store/src/migrations.ts` imports the journal and each `.sql` with import attributes (`with { type: "text" }`, verified to survive `--compile`) and materialises them into a content-addressed temporary folder only when no folder is on disk. Byte-identical to Drizzle's own layout, so bookkeeping is unchanged — verified: a database migrated from the embedded copy records hash `38f97c41…686d52f` and `created_at 1788653253561`, exactly matching one migrated from the on-disk folder, so no existing database re-migrates.
Odhad: střední

### A2.6 – The compiled `ho` binary cannot serve the UI and its `doctor` returns 500

Severita: high
Kde: `packages/daemon/src/paths.ts:26-28`, reached from `packages/daemon/src/images.ts:112-127` and `packages/daemon/src/server.ts#serveUi`
Důkaz: Found in Wave 2, after A2.5 made the compiled daemon start at all. Against a binary built from this branch (`bun build --compile apps/cli/src/main.ts`): the daemon starts and `/health` answers `{"ok":true}`, but `GET /` returns **404 `not found`** and `ho doctor` prints `ho: Internal server error`. The daemon's own start line says `"resources":"/"` — `defaultResourcesRoot()` is `resolve(import.meta.dir, "../../..")`, which in a compiled executable walks a virtual path up to `/`. So `uiDir` and `assetsDir` resolve to nothing (`whenPresent` correctly returns null, hence the 404), and `imageContext("agent")` returns `/images/agent`, which does not exist: with the error interceptor added in B29.5 the daemon now logs the cause, `ENOENT: no such file or directory, open '/images/agent'`. Pre-existing, and the same root cause as A2.5: only the migrations layer was fixed there.
Dopad: A self-compiled `ho` runs projects, agents and tasks fine but cannot show the office and cannot report or build images. The shipped desktop app is unaffected (it passes `resourcesRoot`), and so is running from source.
Doporučení: Make `Resources.imageContext` nullable like every other field in that type, and have `imageStatus`/`ensureImages` report "no image context in this build" instead of throwing; then `doctor` degrades to a truthful report instead of a 500.
**Done in Wave 5, and it is broader than the finding said.** `imageContext` is nullable, `imageSpecs` returns null without contexts, `ensureImages` refuses with a sentence, `imageStatus` returns nothing and `Doctor` carries `imageContexts` so the CLI and the setup step say _why_ there are no image rows instead of implying none are needed. `daemon.json` gained `serves: { ui, images }`, so `ho ui` refuses up front instead of opening a URL that 404s, and the 404 body itself now explains. Verified against a compiled binary: `/health` ok, `GET /` returns the explanation, `ho ui --print` and `ho image build` both refuse with a sentence, `daemon.json` says `{ui: false, images: false}`; and from source nothing changed (`serves {ui: true, images: true}`, `GET /` 200, `doctor` lists both images, `ho ui --print` prints the tokened URL). Chasing the 500 also uncovered **A2.7**: the request never returned because a Keychain read from a compiled binary blocks forever.
Odhad: střední

### A2.7 – Reading a secret from a compiled binary blocks forever on macOS

Severita: high
Kde: `packages/secrets/src/keychain.ts` at the audited baseline
Důkaz: Found in Wave 5 while fixing A2.6. The same Keychain item read with `Bun.secrets`:

```
$ bun run <probe>.ts          → present=true in 30 ms
$ bun build --compile <probe>.ts --outfile keyprobe && ./keyprobe
                              → no output, still running after 15 s (killed)
```

macOS decides Keychain access per application identity, and a freshly compiled binary is a new
application: the read waits on an authorisation prompt that nothing in a terminal answers. The daemon read
secrets with no timeout, so `ho doctor` and any session start from a compiled `ho` hung indefinitely — the
symptom that made A2.6's investigation confusing, because the request never returned at all.
Dopad: A self-compiled `ho` appears to hang with no message. The shipped desktop app is unaffected in
practice (one application identity, the user approves once), and running from source is unaffected.
Doporučení: A secret read must not be able to stall the daemon: bound it and say what happened. Done in
Wave 5 — 5 s per call, with a message naming the cause. Verified: the compiled `ho doctor` now fails after
6 s with "the system secret store did not answer in 5 s; on macOS a build it has not seen before waits for
a Keychain access prompt (approve it, or use a file-backed secret store)", and the daemon logs the same at
error level.
Odhad: triviální

### A1.4 – No `incremental`, so every typecheck is a cold start

Severita: medium
Kde: `tsconfig.base.json:1-25`, `scripts/typecheck.ts:11-30`
Důkaz: `bun run typecheck` runs `tsc -p <config>` 16 times through a hand-written 4-way promise pool. No config sets `incremental`, so each invocation re-parses `@ho/protocol` and `@ho/core` from scratch. Measured baseline: 2.33 s wall, **13.62 s user CPU** for the whole `check` pipeline. Verified in this session that TypeScript 7.0.2 accepts `incremental: true` together with `noEmit: true` when `tsBuildInfoFile` points outside the source tree, emitting only the cache file.
Dopad: Výkon/DX: every commit pays the full cost through the pre-commit hook (`.githooks/pre-commit`).
Doporučení: Add `incremental: true` to `tsconfig.base.json` and give each project a `tsBuildInfoFile` under a git-ignored cache directory.
**Project references were evaluated and rejected**: TypeScript 7.0.2 rejects a referenced project that disables emit — `error TS6310: Referenced project '…' may not disable emit` (reproduced in this session) — so composite would force `.d.ts` emission into a monorepo whose packages deliberately export `./src/index.ts` and rely on `allowImportingTsExtensions`. The cost is artefacts and export rewiring; the win over plain `incremental` is under two seconds.
Zdroj: Local `./node_modules/.bin/tsc` 7.0.2, experiments run in the session scratchpad (TS6310 for composite+noEmit; clean run for incremental+noEmit+tsBuildInfoFile). Also TS5102: `baseUrl` has been removed in TypeScript 7 — the repo does not use it, so nothing to fix.
Odhad: triviální

### A1.5 – `knip.json` does not cover `apps/cli`

Severita: medium
Kde: `knip.json:3-20`
Důkaz: The `workspaces` map has entries for `.`, `packages/*`, `spikes/*`, `apps/desktop` and `packages/ui` — but nothing for `apps/cli`. With no entry and no matching glob, knip analyses that workspace with its default heuristics only; the `bin` field (`./src/main.ts`) is picked up, but the 16 command modules under `apps/cli/src/commands/` are reachable only through it and their own unused exports are not reported. `bun run knip` is silent today, which is consistent with either "clean" or "not looked at".
Dopad: Udržovatelnost: the largest app by file count (22 files) is outside the dead-code net.
Doporučení: Add an explicit `apps/cli` entry (`entry: ["src/main.ts"]`, `project: ["src/**/*.ts"]`).
Odhad: triviální

### A1.6 – `apps/desktop/tsconfig.json` switches off four strictness flags for the whole app

Severita: medium
Kde: `apps/desktop/tsconfig.json:9-13`
Důkaz: `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess` and `noImplicitReturns` are all `false`, with the stated reason that the Electrobun devkit is typechecked as source through `paths` and does not satisfy them. The reason is real — `paths` maps `electrobun` to `./.hutch/devkit/api/sdks/main/index.ts`, i.e. third-party source inside the program — but the relaxation also applies to `apps/desktop/src/**`, which is 5 files of our own code (~350 lines) including the window and quit lifecycle.
Dopad: Typová bezpečnost: the app that owns process lifetime and the single-instance lock is compiled with the weakest settings in the repository.
Doporučení: Keep the devkit out of the strict program rather than weakening the program.
**Measured in Wave 5, and two of the four were switched off for nothing.** Removing each flag on its own and
counting errors (`tsc -p` on a copy of the config):

```
exactOptionalPropertyTypes          15 errors, 0 in apps/desktop/src
noPropertyAccessFromIndexSignature   0 errors
noUncheckedIndexedAccess             0 errors
noImplicitReturns                    1 error,  0 in apps/desktop/src
```

So `noPropertyAccessFromIndexSignature` and `noUncheckedIndexedAccess` are **re-enabled**, and the app is
now as strict as the rest of the repository except for two flags whose 16 violations are all inside
`.hutch/devkit`. Keeping the devkit out of the program was attempted and does not work: the devkit ships no
`.d.ts` for its SDK (only two `global.d.ts`), and declaration-only emit over its source fails with
`error TS4094: Property 'partitionId' of exported anonymous class type may not be private or protected` —
a defect in the vendored source, not something this repository can configure away. The remaining two flags
stay off with that measurement recorded in the config, so the next reader knows exactly what they cost.
Odhad: střední

### A1.7 – No `trustedDependencies` allowlist for install-time scripts

Severita: low
Kde: `bunfig.toml:1-3`, `package.json`
Důkaz: `bunfig.toml` contains only `[install] linker = "isolated"` and `exact = true`. `bun install` runs lifecycle scripts, and this repository installs `sharp` (native binaries) and `electrobun` into a project whose entire security posture is about not trusting agent-adjacent code. There is no allowlist naming which packages may run postinstall.
Dopad: Bezpečnost (supply chain): any dependency update can execute code at install time, including in CI.
Doporučení: Add a `trustedDependencies` array to `package.json` listing only the packages that genuinely need postinstall.
Zdroj: Bun 1.4.2, https://bun.com/docs — install configuration.
Odhad: triviální

### A1.8 – A 62 MB abandoned build artefact sits in the repository root

Severita: low
Kde: repository root: `.044874220869ed4f-00000000.bun-build` (61 884 464 bytes, dated 2026-09-05)
Důkaz: `.gitignore:14` has `*.bun-build`, so the file is correctly untracked and `git status` is clean. It is a leftover from an interrupted `bun build --compile` and nothing removes it.
Dopad: DX: 62 MB of rubble in the project root.
Doporučení: Delete the file. No `.gitignore` change needed.
Odhad: triviální

### A1.9 – Verified: every other configuration file

Severita: —
Kde: `.editorconfig`, `.gitattributes`, `.oxfmtrc.json`, `packages/store/drizzle.config.ts`, `images/*/.dockerignore`, `.githooks/pre-commit`, `apps/desktop/hutch.config.ts`, `apps/desktop/electrobun.config.ts`, `images/agent/rtk-config.toml`
Důkaz: `oxfmt --check` covers 291 files including Markdown (it flagged `audit/INVENTORY.md` the moment that file was first written), so formatting is enforced repository-wide; `.editorconfig` duplicates indent/EOL for editors with no conflict. `.gitattributes` forces LF and marks the five binary image types. `drizzle.config.ts` matches `packages/store/src/schema.ts` and the one migration in `drizzle/`. Both `.dockerignore` files are deny-all-then-allowlist. The pre-commit hook is `set -e; bun run check`. `electrobun.config.ts` validates `HO_RELEASE_VERSION` against a strict semver regex and disables CEF bundling, codesigning and notarisation deliberately (the release notes tell the user to clear the quarantine flag, which matches). `rtk-config.toml` excludes `curl` and `claude` from RTK's hooks and keeps failed-command output on tmpfs — consistent with `images/agent/Dockerfile:52`. Nothing to fix in any of them.
Doporučení: None. Recorded so A1 has no unexamined configuration file.

---

## A2 — GitHub Actions

### A2.1 – CI never builds the Docker images the product cannot run without

Severita: high
Kde: `.github/workflows/ci.yml:16-40`
Důkaz: The `check` job typechecks, lints, formats, runs knip, `bun audit`, `npm audit` over the four sandbox manifests, builds the UI and the asset manifest, and compiles the CLI and the runner. It never runs `docker build` on `images/agent/Dockerfile` or `images/git-bridge/Dockerfile`. The agent Dockerfile has a hard `RUN test "$TARGETARCH" = arm64` (`images/agent/Dockerfile:9`), five build targets, an apk repository added from `downloads.claude.ai`, a `cargo install` from a git revision, and three `--version` smoke checks — none of which has a CI signal. `release.yml` does not build them either; it builds the desktop app, which only bundles the build _context_.
Dopad: Náklady/DX: a broken agent image is discovered by the user minutes into first-run setup. A change to `mcp/package.json` that breaks the two `test -f` assertions (`images/agent/Dockerfile:31-32`) is invisible until then.
Doporučení: Add a job that builds at least the `base` and `claude-code` targets on an arm64 runner with buildx cache; if arm64 runners are unavailable, build under QEMU on a schedule rather than on the pull-request critical path.
Odhad: střední

### A2.2 – Nothing verifies that the daemon actually starts

Severita: high
Kde: `.github/workflows/ci.yml:38-40`
Důkaz: CI compiles `apps/cli/src/main.ts` and `packages/runner/src/main.ts` and stops. No step starts the daemon and hits `/health` — even though that is a ten-second, Docker-free check (verified by hand in this session: with an empty `HO_HOME` the daemon opens SQLite, runs migrations, replays an empty log, binds 127.0.0.1:47800 and serves `/health`).
Dopad: A regression in `openDatabase`, the migrations, `Bun.serve` or the oRPC wiring ships green.
Doporučení: One step: start `ho daemon` with a temporary `HO_HOME` in the background, poll `/health` until 200 with a timeout, assert `daemon.json` exists with mode 0600, then SIGTERM.
Odhad: triviální

### A2.3 – The sandbox audit reads lockfiles without checking they match their manifests

Severita: low
Kde: `.github/workflows/ci.yml:22-27`
Důkaz: `npm audit --omit=dev --prefix "$directory"` runs for `images/agent/mcp` and each `images/agent/providers/*` — genuinely more than most repositories do. `--prefix` makes npm read that directory's `package-lock.json`; if a lockfile drifts from its `package.json`, npm audits the lockfile and says nothing about the drift.
Dopad: Bezpečnost: a `package.json` bump without `npm install` is audited as the old tree.
Doporučení: Add `npm ls --prefix "$directory" --package-lock-only >/dev/null` before the audit.
**Correction after Wave 1.** Wave 1 added it without `--package-lock-only`, which reads `node_modules`. Nothing installs those four directories in CI — `npm audit --prefix` works from `package-lock.json` alone, which is exactly why the original step needed no install — so the guard as first written would have failed every CI run. Caught in Wave 2 by running the step locally. Verified in both directions with `--package-lock-only`: exit 1 with a dependency added to `package.json` only, exit 0 once reverted.
Odhad: triviální

### A2.4 – Verified good: action pinning, permissions, concurrency, release-tag ancestry

Severita: —
Kde: `.github/workflows/ci.yml:1-15`, `.github/workflows/release.yml:1-40`
Důkaz: Every third-party action is pinned to a 40-hex commit SHA (`actions/checkout@3d3c42e5…`, `oven-sh/setup-bun@0c5077e5…`, `actions/upload-artifact@043fb46d…`, `actions/download-artifact@3e5f45b2…`). `permissions: contents: read` at workflow level, with `contents: write` narrowed to the `publish` job. `persist-credentials: false` on every checkout. Concurrency groups with `cancel-in-progress: true` for CI and `false` for release. The release job validates the tag against a strict semver regex **and** asserts `git merge-base --is-ancestor HEAD origin/main`, so a tag on a side branch cannot ship. SHA-256 checksums are published with the artefacts.
Doporučení: None.

---

## A3 — Markdown accuracy

### A3.1 – The documentation is accurate today and this audit will invalidate parts of it

Severita: medium
Kde: `AGENTS.md`, `README.md`, `docs/STACK.md`, `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md`, `docs/PLAN.md`, `docs/OFFICE-ART.md`
Důkaz: Spot-checked claims that hold: the command list in `AGENTS.md` matches `package.json` scripts exactly; `packages/core` and `packages/sim` really do set `types: []` and contain no I/O; the scope really is `@ho/*`; the layout list matches the tree. Claims this audit will invalidate: the dependency set (`proper-lockfile` is going), the lint configuration, the CLI's argument handling, the typecheck mechanism, the agent settings.
Dopad: Udržovatelnost: documentation that is accurate becomes misleading precisely because the audit changes what it describes.
Doporučení: Rewrite in Wave 7, after the code has settled.
Odhad: střední

### A3.2 – A previous audit's report lives in the documentation tree

Severita: low
Kde: `docs/audit/2026-09.md` (25 293 bytes)
Důkaz: A 25 KB audit report sits under `docs/`, and a branch `codex/monorepo-audit-2026-09` exists locally and on origin. It is a point-in-time report, not documentation of the current system, and it competes with `audit/` for the same role. This session treated it as an unverified claim set and did not read it as evidence.
Dopad: Udržovatelnost: two audit reports in two directories, with nothing marking which is current.
Doporučení: Move it under `docs/history/`, where the repository already keeps superseded documents, leaving `audit/` as the live location.
Odhad: triviální

### A3.3 – Verified: `assets/README.md` is load-bearing and matches the code

Severita: —
Kde: `assets/README.md`
Důkaz: `scripts/lib/manifest.ts:7` (the `FRAME` regex), `scripts/lib/import-target.ts:63-72` (categories and animation-name rules) and `packages/ui/src/office/sprites.ts:5-9` (the manifest schema) all implement rules this file states, and the three agree with each other. No drift found.
Doporučení: Keep it; cross-reference it from `docs/OFFICE-ART.md` in Wave 7.

---

## A4 — Bun setup

### A4.1 – Verified: pinning is consistent and the catalog is essentially current

Severita: —
Kde: `package.json:70-72`, both workflows, `images/agent/Dockerfile:7`
Důkaz: `engines.bun: ">=1.4.2"`, `packageManager: "bun@1.4.2"`, both workflows pin `bun-version: 1.4.2`, the agent image downloads `bun-v1.4.2` verified by SHA-256, and the local toolchain is 1.4.2. The catalog's 30 entries were checked against the npm registry in this session: **27 are the current latest**, three are one release behind. Nothing is deprecated. `bun install --frozen-lockfile` reproduces in 28 ms with no changes.
Doporučení: Bump the three (A4.2, plus `knip` 6.34.0 → 6.35.0 and `chrome-devtools-mcp` 1.8.0 → 1.9.0).
Zdroj: npm registry sweep, 2026-09-08 — full table in `audit/DEPENDENCIES.md`.

### A4.2 – `@types/bun` is one patch behind the Bun it types

Severita: low
Kde: `package.json` catalog, `@types/bun: "1.4.1"`
Důkaz: Bun is pinned at 1.4.2 everywhere; `@types/bun` is 1.4.1 and the registry's latest is 1.4.2 (published 2026-09-08).
Dopad: Typová bezpečnost: APIs added in 1.4.2 are untyped.
Doporučení: Bump to 1.4.2.
Odhad: triviální

### A4.3 – `zod` is missing from root devDependencies, which is why one boundary is hand-validated

Severita: low
Kde: `package.json:53-63`, `scripts/lib/import-target.ts:170-181`
Důkaz: The root declares `@ho/sim` as a devDependency so the asset scripts can import `CELL_PX`/`officePlan` (this works — `bun run assets:manifest` succeeds). It does **not** declare `zod`, and with `linker = "isolated"` nothing is hoisted, so `scripts/lib/import-target.ts` hand-writes `isRecord`/`isSize`/`isBox`/`isSidecar` in a repository whose stated rule is "validate every boundary with Zod" and which does so in nine workspaces.
Dopad: Konzistence: one boundary validated by weaker, hand-written predicates (they accept extra keys and non-finite numbers).
Doporučení: Add `zod: "catalog:"` to root devDependencies (already in `bun.lock`, so no new download) and replace the four guards with one schema.
Odhad: triviální

---

## B1, B9 — Directory structure and code architecture

### B1.1 – `definedOnly` is a generic utility exported from a project-specific module

Severita: medium
Kde: `packages/core/src/commands/projects.ts:135-142`, imported by `packages/core/src/commands/agents.ts:17`
Důkaz: `definedOnly<T>(patch)` drops `undefined` values so a partial patch cannot erase fields under `exactOptionalPropertyTypes`. It has nothing to do with projects but lives in `commands/projects.ts`, and `commands/agents.ts` imports it from there. It also carries the repository's only `no-unsafe-type-assertion` suppression (line 140).
Dopad: Udržovatelnost: a cross-cutting helper reachable only through an unrelated module, while `commands/shared.ts` exists for exactly this.
Doporučení: Move it to `shared.ts` (or a dedicated `patch.ts`) and re-export from the barrel.
Odhad: triviální

### B1.2 – The runner wire protocol is in the public protocol barrel, so the browser bundles it

Severita: nice-to-have
Kde: `packages/protocol/src/runner.ts`, `packages/protocol/src/index.ts:9`
Důkaz: `runner.ts` is re-exported from the barrel, so `@ho/ui` and `@ho/cli` pull the runner frame schemas into their type graph and — since Zod schemas are runtime values — into the UI bundle, even though nothing in a browser can spawn a process.
Dopad: Výkon: dead schema objects in the 1 100 KiB UI bundle. Architektura: an internal daemon↔sandbox contract in the package that defines the _public_ vocabulary.
Doporučení: Keep the file (it is genuinely a protocol) but expose it through a subpath export (`@ho/protocol/runner`) so only the daemon and runner pull it in. Done in Wave 3.
**Correction after Wave 3.** The claim was half right and is worth stating precisely: the schemas really were in the browser bundle (`grep -c stdin_close packages/ui/dist/index-*.js` → **1** before, **0** after), but they are small — the bundle stays **1099 KiB** either way. The reason to make the change is the architecture (an internal daemon↔sandbox contract sitting in the package that defines the public vocabulary), not the bytes.
Odhad: střední

### B1.3 – The `@ho/sim` barrel is neither everything nor a deliberate surface

Severita: low
Kde: `packages/sim/src/index.ts`
Důkaz: 14 of 17 modules are re-exported. `steps.ts` and `office-anchors.ts` are correctly internal. But `templates.ts`, `office-decor.ts` and `office-audit.ts` are exported while only one of their symbols is used outside the package (`auditOffice`, by the UI bridge); nothing from `office-decor` is. Consumers use 25 symbols in total.
Dopad: Udržovatelnost: no stated rule for barrel membership, so it drifts.
Doporučení: Export what consumers use and drop the rest.
Odhad: triviální

### B9.1 – The Docker adapter's URL encoding leaks into the port's data type

Severita: medium
Kde: `packages/daemon/src/recover-sessions.ts:21`
Důkaz: `const handle = { id: encodeURIComponent(container.name), name: container.name };` — the daemon builds a `SandboxHandle` whose `id` is a percent-encoded container name, because `packages/sandbox-docker/src/provider.ts` interpolates `handle.id` straight into Engine API paths (`/containers/${handle.id}/stop`). The core port (`packages/core/src/sandbox.ts:37`) declares `{ id: string; name: string }` with no such contract.
Dopad: Architektura: a daemon caller must know how the Docker adapter builds URLs, and any other `SandboxProvider` would double-encode.
Doporučení: Encode inside the adapter at each call site and let callers pass the plain name.
Odhad: triviální

### B9.2 – The simulation mutates its own layout data to store one animation flag

Severita: medium
Kde: `packages/sim/src/mail.ts:145-155`, `packages/sim/src/office-plan.ts:293`
Důkaz: `setMailboxState` walks `floor.template.furniture` and assigns `item.animation = state`. `FloorTemplate` is otherwise read-only data produced by `officePlan()`, and the world already has a channel for exactly this — `Floor.animations: Map<string, number>` (`packages/sim/src/world.ts:115`), which the elevator uses. Cross-floor contamination was checked and does **not** occur: `officePlan(floorId)` builds a fresh `Plan` per call and `Bridge.planFor` caches per floor id (`packages/ui/src/office/bridge.ts:76-83`).
Dopad: Udržovatelnost: two mechanisms for object animation state, one of which writes into the layout.
Doporučení: Publish the mailbox state through the floor's animation channel and make `FloorTemplate.furniture` readonly.
Odhad: střední

---

## B2, B3, B12, B15 — Refactoring, simplification, readability

### B15.1 – The `exactOptionalPropertyTypes` spread guard appears **63 times**

Severita: high
Kde: 62 occurrences across 23 files; densest: `apps/cli/src/commands/agent.ts` (11), `packages/core/src/commands/tasks.ts` (7), `packages/sim/src/office-builder.ts` (6), `apps/cli/src/commands/task.ts` (6), `packages/core/src/model/reduce.ts` (5)
Důkaz: `git ls-files '*.ts' '*.tsx' | xargs grep -o '=== undefined ? {}' | wc -l` → **62**. **Correction (Wave 2):** the real count is **63** — that grep is line-based and one occurrence in `apps/cli/src/commands/agent.ts` was written across three lines. All 63 are now `compact(...)`. Every one is `...(x === undefined ? {} : { key: x })`, needed because `exactOptionalPropertyTypes: true` forbids assigning `undefined` to an optional property. `packages/core/src/commands/agents.ts:99-115` is 13 consecutive lines of it.
Dopad: Čitelnost: the single largest readability tax in the codebase; the intent ("build a patch from the flags that were given") is buried in ceremony. A typed helper already exists (`definedOnly`) and is used in **two** places.
Doporučení: One exported `compact(obj)` returning `{ [K in keyof T]: Exclude<T[K], undefined> }` — `definedOnly` promoted and typed with `type-fest` so no assertion is needed — applied at all 62 sites. Expected: ~120 fewer lines and a large legibility gain.
Odhad: střední

### B15.2 – `walkSteps` takes two parameters it does not use

Severita: low
Kde: `packages/sim/src/actors.ts:153`
Důkaz: `export const walkSteps = (_world: World, _actor: Actor, floorId: string, to: Point): Step[] => [{ kind: "walk", floorId, to, path: null }];` — the first two arguments are unused and underscore-prefixed, and nine call sites thread a `world` and an `actor` that are discarded.
Dopad: Čitelnost: a one-line object literal wearing a four-parameter signature.
Doporučení: Reduce to `walkSteps(floorId, to)`.
Odhad: triviální

### B15.3 – Repeated `--import` flags are hand-parsed although `parseArgs` supports it

Severita: medium
Kde: `apps/cli/src/commands/project.ts:83-98` (`splitImports`)
Důkaz: A 15-line function scans argv for `--import <value>` pairs, with the comment "parseArgs keeps only the last value, so repeats are collected by hand". That is not true of the API in use: `node:util`'s `parseArgs` accepts `multiple: true` per option. Proved empirically on the repository's own runtime — `bun -e 'import {parseArgs} from "node:util"; parseArgs({args:["--import","a","--import","b","x"],options:{import:{type:"string",multiple:true}},allowPositionals:true,strict:true})'` → `{"values":{"import":["a","b"]},"positionals":["x"]}`.
Dopad: Udržovatelnost: 15 lines of argv re-implementation, plus a comment that misinforms the next reader.
Doporučení: Delete `splitImports`; declare `import: { type: "string", multiple: true }`.
Zdroj: https://nodejs.org/api/util.html (`options[key].multiple` — "Whether this option can be provided multiple times"), read 2026-09-08; behaviour confirmed on Bun 1.4.2.
Odhad: triviální

### B15.4 – Three dead lines: a pointless alias, a pointless local, and an unreachable fallback

Severita: low
Kde: `packages/intake-github/src/index.ts:89`; `packages/core/src/commands/review.ts:84`; `packages/daemon/src/publish.ts:65`, `:72`
Důkaz: (a) `const signal = cancel;` immediately after the parameter is available — a rename with no purpose. (b) `const to: TaskStatus = "done";` used once, three lines later. (c) `["--repo", githubRepoFromUrl(project.repo.url) ?? ""]` — the `?? ""` branch is unreachable because lines 65-68 already threw `pull requests need a GitHub URL` when the same call returns `null`; the same lookup is also performed twice.
Dopad: Čitelnost, and (c) is a duplicated computation behind an impossible fallback.
Doporučení: Remove (a) and (b); compute the repo once and reuse it in (c).
Odhad: triviální

### B12.1 – Four doc comments sit above the wrong function

Severita: medium
Kde: `packages/ui/src/office/plan-view.ts:190`; `packages/ui/src/office/stand-ins.ts:46`, `:68`, `:69`
Důkaz: `plan-view.ts:190` is `/** Sliding leaves retract toward the jambs; the threshold stays walkable regardless (visual only). */`, immediately followed by a second doc comment and then `function artSprite(...)`; the sentence describes `drawDoor` (line 219). `stand-ins.ts:46` is a comment about floor fills and wall caps directly above `function desk(...)` — it describes `architecture()`, which is in a **different file**. `stand-ins.ts:68-69` has two consecutive doc comments where the first ("Geometric stand-in for an object whose sprite has not been delivered yet") belongs to `standIn()` at line 210.
Dopad: Udržovatelnost: a reader trusting the comment above `desk()` learns about floor tiling. Actively misleading, which is worse than no comment.
Doporučení: Move each comment to the function it describes, or delete it where that function already has one.
Odhad: triviální

---

## B4, B7, B29 — Architecture effectiveness, modernisation, patterns

### B4.1 – Every read-model query is a full linear scan; the projection has no indexes

Severita: high
Kde: `packages/core/src/model/read-model.ts:16-24`; scans at `packages/core/src/commands/shared.ts:21`, `:34`, `:39`, `:45`; `packages/core/src/commands/mail.ts:43`, `:142`; `packages/core/src/commands/sessions.ts:33`, `:67`, `:83`; `packages/core/src/scheduler.ts:29`, `:36`; `packages/core/src/commands/review.ts:18`; `packages/daemon/src/rpc/router.ts:154`, `:173`, `:204`, `:218`, `:228`; `packages/daemon/src/intake.ts:209`; `packages/daemon/src/usage.ts:44`
Důkaz: `ReadModel` is five `Map`s plus a `ChatMessage[]`, and every question that is not "by primary key" is answered with `[...map.values()].filter(...)`. Concrete chains: `bossOf(model, projectId)` → `membersOf` → full agent scan, called on every chat message, every mail item, and twice per `task.status_changed` in `boss-voice.ts`. `startSession` performs two full session scans plus `resumableSession`'s third scan and a sort. `planSessionStarts` copies **and sorts every task in the model** on each invocation.
Dopad: Výkon/RAM: the event log is append-only and never trimmed, so `tasks`, `sessions` and `chat` grow for the lifetime of the installation. At 5 000 tasks the scheduler alone allocates and sorts a 5 000-element array every 2 seconds (see B10.1), and each `tasks.list` RPC copies it again.
Doporučení: Add derived indexes maintained by `applyEvent` — `agentsByProject`, `bossByProject`, `tasksByProject`, `sessionsByTask`, `sessionsByAgent`, `activeSessions`, `mailByExternalId` — and turn the hot helpers into lookups. Contained work: `applyEvent` is the single writer, so the indexes cannot drift.
Odhad: velký

### B4.2 – `chat` is an unbounded array, copied wholesale on every UI update

Severita: high
Kde: `packages/core/src/model/read-model.ts:21`, `packages/core/src/model/reduce.ts:158`, `packages/ui/src/store.ts:34-41`, `packages/daemon/src/rpc/router.ts:217-221`
Důkaz: `model.chat` is a plain array that `applyEvent` only ever pushes to. `takeSnapshot()` does `chat: [...model.chat]` — a full copy — and runs from `scheduleModelBump()` on every animation frame in which any event arrived. `chat.history` filters the whole array server-side then `slice(-limit)`. Each message allows 20 000 characters (`packages/protocol/src/domain.ts:234`).
Dopad: RAM/výkon: unbounded growth in the daemon _and_ in every connected UI, plus an O(n) copy per frame during replay.
Doporučení: Hold chat per project in a `Map<ProjectId, ChatMessage[]>` with a bounded tail in the projection (the full history stays in the event log and can be replayed), and let the UI snapshot share the array instead of copying it — the projection is only mutated by `applyEvent`, so a frozen reference is safe.
Odhad: velký

### B4.3 – The MCP gateway builds a whole server and transport per tool call

Severita: medium
Kde: `packages/daemon/src/mcp.ts:251-266`, `:268-290`
Důkaz: `handle(req)` calls `#build(entry)`, which instantiates `new McpServer(...)`, registers four to six tools (each converting a Zod `inputSchema` to JSON Schema), then creates a transport, connects, serves one request and closes. This happens on **every** MCP request from the sandbox — every `ho_report`, `ho_task_status`, `ho_list_agents`.
Dopad: Výkon/CPU: schema conversion and tool registration repeated per call for a session whose tool set never changes. Stateless-per-request transport is a documented MCP pattern; the _server_ need not be rebuilt.
Doporučení: Build the `McpServer` once in `register()` and cache it on the entry; keep the transport per request.
Odhad: střední

### B29.1 – TanStack Query is used for queries only; every mutation is hand-rolled

Severita: medium
Kde: `packages/ui/src/queries.ts` (3 queries) vs. `packages/ui/src/panels/settings-projects.tsx:18-33`, `settings-agents.tsx:64-69`, `settings-token.tsx:39-72`, `settings-intake.tsx:128-184`, `chat.tsx:84-107`, `resources.tsx:20-39`, `packages/ui/src/setup/steps-environment.tsx:56-82`, `:120-136`, `steps-office.tsx:78-95`, `packages/ui/src/panels/add-project.tsx:204-224`
Důkaz: `@tanstack/react-query@5.102.8` is a dependency and `useQuery` appears three times (doctor, usage, resources). Every write is `getClient()?.x.y(...).then(ok, fail)` with hand-written `useState` for `busy`/`sending`/`error`/`note` — ten components each re-implementing pending state, error capture and manual refresh. `settings-token.tsx` even hand-rolls `refresh()` plus `useEffect(refresh, [connection])` where a `useQuery` would do.
Dopad: Udržovatelnost: ~200 lines of duplicated request plumbing, with inconsistent behaviour — some paths swallow errors with `() => null`, some surface them, some refetch, some do not.
Doporučení: `useMutation` + `invalidateQueries` for the writes, `useQuery` for `secrets.status` and `intake.status`. The library is already paid for.
Odhad: střední

### B29.2 – Two near-identical WebSocket handshake implementations

Severita: medium
Kde: `packages/ui/src/rpc.ts:38-76` and `apps/cli/src/client.ts:9-53`
Důkaz: Both open a WebSocket, register `open`/`error`/`close`, install a 10 000 ms deadline, clean up all three listeners plus the timer, and reject with a message. They differ only in how the token travels (subprotocol vs. `Authorization` header) and in the error text.
Dopad: Duplikace: the timeout and cleanup logic — the part that is easy to get wrong — exists twice.
Doporučení: One `connectRpc({ url, auth })` helper parameterised by how the token is presented.
Odhad: střední

### B29.3 – The intake acknowledgement loop blocks the event subscription on network I/O

Severita: high
Kde: `packages/daemon/src/intake.ts:77-86`
Důkaz: Inside `for await (const event of this.#office.store.subscribe(...))` the loop `await`s `this.#tell(...)`, and `#tell` calls `connector.acknowledge`, which shells out to `gh issue comment` / `gh issue edit` with a 30 s timeout each (`packages/intake-github/src/gh.ts:27-33`). While that runs the subscription's consumer is stalled. The store's channel is bounded at 1 024 items (`packages/core/src/async-channel.ts:13`); on overflow it sets `failure = new Error("stream consumer fell behind; reconnect to resume")`, clears the buffer and closes — after which the `IntakeService` subscription is **dead for the lifetime of the daemon**, logged once as `intake subscription failed`.
Both sibling subscribers deliberately avoid this: `packages/daemon/src/scheduler.ts:70` calls `void tick()` and `packages/daemon/src/boss-voice.ts:153-157` wraps each handler in `track(...)`. Intake is the outlier.
Dopad: A burst of task events during a slow `gh` call permanently stops issue acknowledgements, silently.
Doporučení: Use the same `track()` pattern: dispatch `#tell` without awaiting inside the loop, keep the promise in the pending set the class already has, and drain it in `stop()`.
Odhad: střední

### B29.5 – Unexpected RPC failures reached the client as "Internal server error" and were never logged

Severita: medium
Kde: `packages/daemon/src/server.ts:56` at the audited baseline
Důkaz: `new RPCHandler(router)` was constructed with no options, so oRPC's default behaviour applied: it hides the detail of an unexpected throw from the client (correct) and the daemon wrote nothing about it (not correct). Reproduced in Wave 2: `ho doctor` against a compiled binary printed `ho: Internal server error` while `daemon.log` contained only unrelated lines. Found by needing it, not by reading.
Dopad: Diagnostika: a 500 with no trace anywhere in the product. Every unexpected server-side error was invisible.
Doporučení: Pass oRPC's own `interceptors: [onError(...)]`; log a defined `ORPCError` at debug (those are the protocol's typed rejections, not faults) and anything else at error. Done in Wave 2 — the very first run logged `ENOENT: no such file or directory, open '/images/agent'`, which is A2.6.
Zdroj: `interceptors` on `StandardRPCHandlerOptions` and `onError` re-exported from `@orpc/server`, read in the installed `@orpc/server@1.15.0` typings (`dist/shared/server.BqadksTP.d.mts:52`, `dist/index.d.ts:6`); pattern confirmed in the oRPC docs (https://orpc.dev/docs/adapters/websocket) 2026-09-08.
Odhad: triviální

### B29.4 – Verified good: event sourcing, command purity, port boundaries

Severita: —
Kde: `packages/core/src/**`, `packages/daemon/src/office.ts`, `packages/store/src/event-store.ts`
Důkaz: Every mutation goes through `Office.execute`, which runs a pure command returning `Result<{events, value}, DomainError>`, appends atomically in one SQLite transaction (`event-store.ts:46-66`), then folds the stored events into the projection. Commands are serialised through a promise chain (`office.ts:54-56`), so no two interleave. `packages/core` compiles with `types: []` and imports nothing but `@ho/protocol`. This is a sound architecture, correctly implemented, and the audit proposes no change to it.
Doporučení: None.

---

## B5 — CLI environment

### B5.1 – A 46-line usage string maintained by hand against 18 command modules

Severita: medium
Kde: `apps/cli/src/commands/help.ts:1-46`, `apps/cli/src/commands/run.ts:20-103`
Důkaz: `USAGE` is a template literal listing every command and flag, with nothing tying it to the modules that implement them: `run.ts` is an 84-line `switch` with 18 near-identical arms, and each command re-declares its flag list inside `parse(...)`. A flag added in `agent.ts` is invisible in `--help` until someone remembers.
Dopad: DX: guaranteed drift. The text is currently accurate, which is luck rather than structure.
Doporučení: See ADR 003 — a declarative command table that generates both dispatch and help, or a maintained framework.
Odhad: vyžaduje rozhodnutí (→ `audit/adr/006-cli-framework.md`)

### B5.2 – Every mutating command prints raw JSON

Severita: medium
Kde: `apps/cli/src/output.ts:1-3`; callers at `project.ts:118`, `:147`, `:188`, `:205`, `agent.ts:53`, `:99`, `:128`, `:144`, `task.ts:55`, `:67`, `:78`, `:84`, `chat.ts:23`, `:29`, `session.ts:87`
Důkaz: `print()` is `JSON.stringify(value, null, 2)`. `ho project add "Audit Repo" --path …` printed a 30-line JSON object in this session, including `intake.ackLabel` and `publish.draft`. There is no `--json` flag and no human-readable alternative, while `list` commands use hand-aligned `padEnd` — so the CLI has two unrelated output styles and no way to ask for machine output deliberately.
Dopad: DX: the primary interactive path emits machine output.
Doporučení: A one-line human summary by default plus a global `--json`. Colour via `yoctocolors`, gated on `process.stdout.isTTY`.
Odhad: střední

### B5.3 – Byte formatting is implemented three times with three different units

Severita: low
Kde: `apps/cli/src/commands/doctor.ts:4` (GB, base 1024), `apps/cli/src/commands/resources.ts:4-5` (MB, base 1024), `packages/ui/src/panels/resources.tsx:6-7` (MB, base 1000)
Důkaz: `bytes/1024/1024/1024`, `bytes/1024/1024`, and `bytes/1_000_000`. The same daemon numbers are reported differently by `ho doctor`, `ho resources` and the Resources panel.
Dopad: Správnost: a user comparing CLI and UI sees different sizes for the same volume.
Doporučení: One `formatBytes` in `@ho/protocol` (presentation of protocol data, needed by both clients), base 1024, used by all three.
Odhad: triviální

### B5.4 – The hidden secret prompt leaves the terminal echo off if interrupted

Severita: medium
Kde: `apps/cli/src/commands/secret.ts:8-23`
Důkaz: `readSecret()` runs `stty -echo`, reads one line, and restores `stty echo` in a `finally`. `finally` covers a throw and normal completion but not `SIGINT` — pressing Ctrl-C at the prompt terminates the process with echo still disabled, leaving the user's shell silently non-echoing.
Dopad: DX: Ctrl-C at the password prompt breaks the user's terminal.
Doporučení: Use `@clack/prompts`' `password()`, which owns signal handling and TTY restoration, or install a `SIGINT` handler that restores echo before exiting.
Zdroj: `@clack/prompts@1.8.0`, published 2026-09-07, 20.4 M weekly (npm registry, 2026-09-08).
Odhad: triviální

---

## B6 — UI environment

### B5.5 – A failed image build reached the CLI as "Internal server error"

Severita: medium
Kde: `packages/daemon/src/rpc/router.ts:63-82` (`linesFrom`) at the audited baseline
Důkaz: The build streams its output and then rethrows the underlying `Error`, which oRPC masks as an
unexpected server error. Observed while reproducing B24.3: the user saw the buildx `ERROR: failed to
build …` line from the stream and then `ho: Internal server error`, with nothing about the build.
Dopad: DX/diagnostika: the one line a user reads last says nothing, and the daemon logged nothing either
(B29.5).
Doporučení: Rethrow as an `ORPCError`, which oRPC passes to the client verbatim, like the domain failures
the router already maps. Done in Wave 3; verified with a deliberate `RUN false`:
`ho: image build failed (1): #0 building with "default" instance using docker driver`, exit code 1.
Odhad: triviální

### B6.1 – The office never paints a first frame if the document starts hidden

Severita: medium
Kde: `packages/ui/src/office/office-canvas.tsx:28-38`, `:78`
Důkaz: `onVisibility()` stops the Pixi ticker whenever `document.hidden`, and it is called once at the end of the mount effect. If the document is hidden at mount the ticker never starts, so `showFloor`/`update` never run and the canvas shows only the clear colour. Reproduced in this session: the Claude Browser pane reports `document.hidden === true`, and instrumentation showed a fully populated world (one floor, two actors, `layoutIssues: []`) with `ticking: false` and **0** children on the stage container. Starting the ticker by hand rendered the office correctly.
Dopad: DX: opening the office in a background tab, or in an embedded webview that reports itself hidden, shows a black pane with no indication that anything is waiting. Stopping the ticker while hidden is right; skipping the _first_ frame is not.
Doporučení: Render one frame at mount regardless of visibility, then apply the visibility policy.
**Correction after Wave 2.** That recommendation was measured and is not sufficient, twice over. At mount there is nothing to draw yet — the floors arrive with the event replay, which finishes later — and Pixi's ticker skips an `update()` issued that soon after the previous one, so the extra frame was a no-op both times (observed: `stage.children[0].children.length === 0` after a plain reload). What works, and is what shipped in Wave 2: draw the frame explicitly (the same four calls the ticker callback makes, with `dt = 0`, followed by `app.render()`), once after mount and again on every store change while the document is hidden. The ticker stays stopped, so a hidden office still costs no frames. Verified: after a plain reload in the always-hidden browser pane the floor view is on the stage, both floors and eight actors are in the world, `ticker.started` is false, and the office renders — with no console intervention, which Wave 1 needed.
Odhad: triviální

### B6.6 – While the document is hidden the UI never publishes a snapshot again

Severita: high
Kde: `packages/ui/src/store.ts:140-157` (`scheduleModelBump`), `:159-…` (`scheduleLiveBump`) at the audited baseline
Důkaz: Both bumps guard themselves with a boolean and coalesce through `requestAnimationFrame`. A hidden document never runs a rAF callback — proved in this session: `await new Promise(r => { setTimeout(() => r("no rAF"), 1500); requestAnimationFrame(() => r("rAF fired")); })` returned **"no rAF"** in the browser pane and in a background Chrome window. The flag therefore stays `true` after the first stalled bump and **every later change is dropped**, not merely delayed. Observed end to end: the daemon had two floors and ten events, the UI reported `connection: "online"`, `replayed: true`, and `snapshot.projects.size: 0`, rendering the "Add a project (floor)" empty state. Recovery depends on the browser eventually running the pending callback when the tab is shown; a webview that reports itself hidden for its lifetime never recovers.
Dopad: The office and every panel silently stop reflecting the daemon. This is also what made Wave 1's UI verification need console hacks — the audit blamed the ticker (B6.1) and missed the store.
Doporučení: Fall back to a timeout while `document.hidden` — the frame alignment rAF buys is pointless in a document that is not painting. Done in Wave 2 with a 200 ms hidden-document interval; verified by reloading the pane and seeing both floors, the roster and the office appear on their own.
Odhad: triviální

### B6.2 – The whole projection snapshot is rebuilt and nine panels re-render per model bump

Severita: medium
Kde: `packages/ui/src/store.ts:34-41`, `:145-158`; consumers in `panels/{chat,board,inspector,settings-agents,settings-projects}.tsx`, `panels/add-project.tsx:176`, `setup/overlay.tsx:48`
Důkaz: `takeSnapshot()` allocates five new `Map`s and copies the chat array; `scheduleModelBump()` runs it inside `requestAnimationFrame` whenever any event arrives. Nine components subscribe with `useUi((s) => s.snapshot)`, so all nine re-render on every bump — including `AddProjectModal`, which needs only the agent list.
Dopad: Výkon: O(entities) allocation per frame during replay plus nine subtrees re-rendering for a change that may touch one entity.
Doporučení: Keep the coalescing but expose per-collection slices so Zustand's reference equality can short-circuit unaffected panels.
Odhad: střední

### B6.3 – The UI bundle is 1 100 KiB with no code splitting, and the build config implies otherwise

Severita: medium
Kde: `scripts/ui-build.ts:15-25`
Důkaz: `bun run ui:build` reports `ui: 3 files, 1100 KiB`; PixiJS 8 is the bulk. Everything — office renderer, twelve panels, setup overlay — is one entry chunk, while `naming` already declares a `chunk` pattern that nothing produces.
Dopad: Výkon: first paint of the chat and board panels waits on the whole renderer. On localhost this is milliseconds, so the real impact is small; recorded because the config promises splitting that does not happen.
Doporučení: Either lazy-import `office/scene.ts` (and with it `pixi.js`) behind `React.lazy`, or delete the unused `chunk` naming.
Odhad: střední

### B6.4 – `replyTo` returns `boolean | string`

Severita: low
Kde: `packages/ui/src/setup/steps-office.tsx:13-22`, used at `:38`, `:96`
Důkaz: `(...): boolean | string => reply === undefined ? false : reply.text`, and callers test `typeof reply === "string"`. The union encodes "absent" as `false` beside a payload string, so `""` and `false` are both falsy and an empty reply is indistinguishable from a missing one.
Dopad: Čitelnost a typová bezpečnost.
Doporučení: Return `string | null`.
Odhad: triviální

### B6.5 – `repoOf` accepts URL schemes the protocol then rejects

Severita: low
Kde: `packages/ui/src/panels/add-project.tsx:9-12` vs. `packages/protocol/src/domain.ts:74-81`
Důkaz: The dialog classifies anything matching `/^(?:https?:|git@|ssh:|git:|file:)/` as `{kind:"git"}`. `RepoSource`'s git branch requires `z.url()` plus `/^(?:https:\/\/…|ssh:\/\/…)/`, so `http://`, `git://`, `file:` and scp-style `git@host:owner/repo` all fail server-side — and `git@…` is the form people paste from GitHub.
Dopad: DX: pasting `git@github.com:org/repo.git` produces a Zod validation message instead of either working or saying which forms are accepted.
Doporučení: Normalise scp-style to `ssh://git@host/owner/repo` before sending, or narrow the client-side test to the accepted schemes and say so in the hint.
Odhad: střední

---

## B8, B13 — File and identifier naming

### B13.1 – The provider state volume is called "claude" for every provider

Severita: medium
Kde: `packages/daemon/src/session-run.ts:97`, `:109`, `packages/daemon/src/gc.ts:29`
Důkaz: `configVolume` is built as `` `${volume}-claude-${agentId}` `` with the label `ho.kind: "claude-config"` — but the volume is mounted at `PROVIDERS[ctx.agent.provider].stateDir` (`session-run.ts:71`), i.e. `/home/agent/.local/share/opencode` for OpenCode, `/home/agent/.gemini` for Gemini CLI, `/home/agent/.codex` for Codex. GC prunes by the `claude-config` kind for all of them.
Dopad: Zavádějící pojmenování: `docker volume ls` shows `ho-task-…-claude-…` volumes holding Gemini and Codex state; an operator debugging a Codex session will not find its state.
Doporučení: Rename to `-state-` / `ho.kind: "provider-state"`. Because GC matches on the label, the rename must keep pruning the old value for one release or existing volumes leak — worth stating explicitly, since the repository has no compatibility requirement but the _user's Docker_ does.
Odhad: střední

### B13.2 – `keychain.ts` names a macOS-only store that is in fact cross-platform

Severita: medium
Kde: `packages/secrets/src/keychain.ts`, `packages/secrets/src/index.ts:8-20`
Důkaz: The file, the factory (`createKeychainSecretStore`) and the `SecretStoreKind` value are all "keychain", and the comment says "Keychain on macOS, a 0600 file elsewhere". The implementation is `Bun.secrets`, which Bun documents as using **macOS Keychain Services, Linux libsecret, and Windows Credential Manager**. So the store works on all three platforms and the `auto` rule needlessly downgrades Linux and Windows to a 0600 JSON file.
Dopad: Zavádějící pojmenování, plus a real capability lost on non-macOS hosts. (The file store remains a legitimate fallback — libsecret is often absent on headless Linux.)
Doporučení: Rename to `os-credential-store.ts` / `createOsSecretStore` / kind `"os"`, keep `"file"`, and make `"auto"` try the OS store and fall back on failure rather than deciding on `process.platform`.
Zdroj: https://bun.com/docs/runtime/secrets.md, read 2026-09-08 ("macOS: Keychain Services · Linux: libsecret … · Windows: Windows Credential Manager"; the same page marks the API "new and experimental" — see B25.2).
Odhad: střední

### B13.3 – `turns` reported for ACP providers is a tool-call count

Severita: medium
Kde: `packages/runtime-acp/src/events.ts:74-85`, `packages/protocol/src/domain.ts:133`
Důkaz: `stopToEvent` returns `turns: Math.max(1, turn.toolCalls)`, where `toolCalls` counts `tool_call` session updates. `Usage.turns` is consumed as a conversation turn count: summed into `session.usage.turns`, shown as "turns" in the Inspector (`packages/ui/src/panels/inspector.tsx:7`) and in `ho usage`, and compared against `agent.budgets.maxTurnsPerTask`.
Dopad: Zavádějící data: for OpenCode/Gemini/Codex sessions the "turns" column reports tool calls, so budgets and usage reports mean something different per provider with no indication.
Doporučení: Report `turns: 1` per prompt for ACP — which is what a prompt turn is — and surface tool-call counts, if wanted, as their own field.
Odhad: střední

### B13.4 – Three schemas have no exported type, unlike every sibling

Severita: low
Kde: `packages/protocol/src/inputs.ts:156-159` (`ChatHistoryInput`), `:177-182` (`UsageBucket`), `packages/protocol/src/mcp.ts:91-97` (`McpAgentSummary`)
Důkaz: Every other schema in these files is followed by `export type X = z.infer<typeof X>`; these three are not, so consumers cannot name the type. `McpAgentSummary` is additionally never referenced anywhere (see B28.2).
Dopad: Konzistence.
Doporučení: Add the type exports; delete `McpAgentSummary`.
Odhad: triviální

### B13.5 – The daemon reports `0.0.0-dev` and two components hardcode `0.1.0`

Severita: low
Kde: `packages/daemon/src/launch.ts:22`, `packages/daemon/src/mcp.ts:269`, `packages/runtime-acp/src/negotiate.ts:83`
Důkaz: `const VERSION = "0.0.0-dev"` is what `system.health`, `daemon.json` and the `ho daemon` banner report (confirmed live in this session). Separately the MCP server announces `home-office` version `0.1.0` and the ACP `clientInfo` says `0.1.0`; `apps/desktop/package.json` says `0.1.0` and `electrobun.config.ts` reads `HO_RELEASE_VERSION`. Four sources, three values.
Dopad: Diagnostika: a bug report quoting "0.0.0-dev" identifies nothing, and a provider log showing client `0.1.0` cannot be tied to a build.
Doporučení: One version injected at build time from `HO_RELEASE_VERSION` with a `0.0.0-dev` fallback, read by all four.
Odhad: triviální

---

## B10, B18 — Flow and game mechanics

### B18.1 – The walk step rebuilds a full occupancy set for every walking actor on every frame

Severita: high
Kde: `packages/sim/src/steps.ts:40`, `:53`, `:60`; the builder at `packages/sim/src/actors.ts:114-132`
Důkaz: `occupied(world, self, includeMoving)` iterates **all** actors in the world and builds a fresh `Set<number>` on each call, then returns a closure. `advanceWalk` calls it at line 53 for every actor whose current step is a walk, every frame, and again at line 60 (plus another at line 40 via `findPath`) whenever that actor is blocked. With N actors that is O(N²) `Set` construction per simulation step, and the simulation runs a fixed 30 steps per second (`packages/ui/src/office/bridge.ts:27-28`).
Dopad: Výkon/CPU/baterie: the hottest loop in the product allocates in proportion to the square of the population, on the user's laptop, continuously while the office is open.
Doporučení: Build the occupancy index **once per tick** in `tick()` — two sets, standing tiles and claimed tiles — and pass it into `advanceStep`. Actors already carry `tile` and `moving`, so the index is exact.
Odhad: střední

### B18.2 – `jitterMs` re-hashes the actor id on every blocked frame

Severita: low
Kde: `packages/sim/src/steps.ts:13-19`, called at `:57`
Důkaz: `jitterMs(actor.id)` walks all 36 characters of the UUID and computes a rolling hash, inside the blocked branch — i.e. every frame an actor is waiting. The result is constant per actor.
Dopad: Výkon: small, but pure waste in the hot loop.
Doporučení: Compute once at `spawnActor` and store it on the actor.
Odhad: triviální

### B18.3 – `nearestWalkable` scans full squares and returns the top-left match, not the nearest

Severita: medium
Kde: `packages/sim/src/actors.ts:134-150`
Důkaz: For `r = 1..5` it loops `dy` and `dx` over the whole `[-r, r]` square, so radius 3 re-tests the 25 cells already tested at radius 2. It returns the first walkable cell in scan order, which is the square's top-left corner — for `r = 1` that is `(x-1, y-1)`, a diagonal, in preference to the four orthogonal neighbours.
Dopad: Výkon (~2.5× redundant tests) plus a behaviour bug: "nearest walkable" is neither nearest nor orthogonally preferred, so actors displaced from a blocked target step diagonally away from it.
Doporučení: Iterate ring perimeters and prefer the smaller Manhattan distance within a ring.
Odhad: triviální

### B18.4 – The four-neighbour offset table is written out **five** times

Severita: medium
Kde: `packages/sim/src/grid.ts:96-101`, `packages/sim/src/steps.ts:20-25`, `packages/sim/src/intents.ts:109-114`, `packages/sim/src/mail.ts:53-58`, `packages/sim/src/office-audit.ts:33-38`
Důkaz: Five separate literals of the same four cardinal offsets in three shapes: two `const NEIGHBOURS: readonly Point[]`, one `neighbours(p)` function, one inline `options: Point[]`, one inline array in a `for…of`. Additionally `packages/sim/src/actors.ts:125-131` re-implements `grid.ts`'s `key()` inline as `other.tile.y * 4096 + other.tile.x`.
Dopad: Duplikace: a change to the movement model (diagonals, a different grid stride) has five-plus places to find.
Doporučení: One exported `NEIGHBOURS` and one `neighboursOf(p)` in `grid.ts`; use `key()` in `actors.ts`.
Odhad: triviální

### B18.5 – `adjacentFree` and `besides` are the same function in two files

Severita: medium
Kde: `packages/sim/src/intents.ts:117-120` and `packages/sim/src/mail.ts:47-60`
Důkaz: Both take a target, generate the four neighbours, and return the first walkable one or a fallback. `besides` additionally resolves a hidden actor's home anchor first; that is the only difference.
Dopad: Duplikace in the movement layer.
Doporučení: One `adjacentFree(world, floorId, at)`; keep the home-anchor resolution at the `mail.ts` call site.
Odhad: triviální

### B10.1 – The scheduler polls every 2 seconds although it is already event-driven

Severita: medium
Kde: `packages/daemon/src/scheduler.ts:8`, `:53-55`, `:56-72`
Důkaz: `startScheduler` subscribes to six event types and calls `void tick()` on each — a correct event-driven design — **and** installs `setInterval(tick, 2_000)` for the daemon's lifetime. Each tick runs `planSessionStarts`, which copies and sorts every task in the model (B4.1). The heartbeat exists because a task skipped by `gate.blocks(...)` needs a retry, but that is a bounded wait (the gate's 30 s timeout), not a reason to poll forever.
Dopad: Výkon/CPU: a full task-array copy and sort every two seconds forever, growing with history, on an idle machine.
Doporučení: Drop the unconditional interval; when a tick skips a task because the gate blocks it, schedule one `setTimeout` retry. The gate already resolves waiters on `delivered` and on viewer loss, so the retry is a backstop rather than the mechanism.
Odhad: střední

### B10.2 – The office gate remembers every delivered envelope forever

Severita: medium
Kde: `packages/daemon/src/office-gate.ts:19`, `:50`, `:77`
Důkaz: `#delivered: Map<TaskId, string>` gains an entry for every `office.delivered` RPC (one per handoff, chat triage, mail delivery and status walk-back) and for every animation timeout, and nothing removes one. The map is only ever read for the _latest_ envelope of a task.
Dopad: RAM: unbounded growth in a long-lived daemon, proportional to lifetime envelope count.
Doporučení: Evict on task completion, or keep a bounded LRU — the value is only needed while a waiter might still ask about that task.
Odhad: triviální

---

## B11, B21 — Performance, RAM and CPU

### B11.1 – `usage.summary` reads the entire `session.state_changed` history from SQLite on every call

Severita: high
Kde: `packages/daemon/src/usage.ts:61-70`; reached from `packages/daemon/src/rpc/context.ts:50`, refetched every 10 s by `packages/ui/src/panels/usage.tsx:53`
Důkaz: To count rate-limit incidents the function does `for await (const event of store.read(-1, { types: ["session.state_changed"] }))` and filters in JavaScript — a full scan of that event type from seq 0, **even when `sinceHours` is set**. `read()` pages 500 rows at a time (`packages/store/src/event-store.ts:14`) and re-parses each row through `StoredEvent.parse` (`:20-30`). The Usage panel sets `refetchInterval: 10_000`, so with the panel open this scan runs six times a minute.
Dopad: Výkon/CPU: O(all session state changes) Zod parses every 10 seconds, forever, growing with history. Sessions emit several `state_changed` events each, making it the fastest-growing event type in the log.
Doporučení: Maintain a rate-limit counter in the projection (`applyEvent` already sees every event), or at minimum push the time and reason predicates into the SQL `where` and use `count()` instead of streaming rows.
Odhad: střední

### B11.2 – `event-store.read` filters twice: once in SQL and once in JavaScript

Severita: low
Kde: `packages/store/src/event-store.ts:78-103`, `:32-33`
Důkaz: The query already applies `inArray(events.type, [...filter.types])` (line 84), then every returned row is tested again with `matches(filter, event)` (line 93). The second test can never fail.
Dopad: Výkon: a redundant `Array.includes` per row on the hot replay path.
Doporučení: Drop the in-memory `matches` call in `read` (keep it in `subscribe`, where it is the only filter).
Odhad: triviální

### B11.3 – The floor renderer allocates a filtered actor array every frame and rescans it per door

Severita: medium
Kde: `packages/ui/src/office/plan-view.ts:133`, `:157`, `:176`, `:43-57`
Důkaz: `update()` begins with `const people = [...world.actors.values()].filter(...)` — one array allocation per frame. `anyoneHeading(people, rect)` is then called once per `playback: "near"` object and once per door; the plan declares 13 doors (`packages/sim/src/office-plan.ts:61-73`), and each call iterates `people` and, for walkers, up to 4 path cells.
Dopad: Výkon: ~14 × N iterations plus an array allocation per frame at 30 fps.
Doporučení: Derive the door and near-object targets from a single pass over the actors per frame, and reuse a scratch array.
Odhad: střední

### B21.1 – `removeActor` sweeps every reservation on every floor

Severita: low
Kde: `packages/sim/src/actors.ts:64-85`
Důkaz: After `release(world, actor)` has already dropped the actor's own reservation, the function loops over **all** floors and **all** their reservations looking for entries owned by the id. The plan has 60+ anchors per floor.
Dopad: Výkon: O(floors × anchors) on every actor removal, for a defensive sweep that `release` plus the `home` bookkeeping already covers.
Doporučení: Drop the sweep, or bound it by the actor's own `reservation`/`home` records.
Odhad: triviální

### B21.2 – `ho-runner` embeds a second Bun runtime into an image that already has Bun

Severita: medium
Kde: `packages/runner/package.json:8`, `packages/daemon/src/images.ts:35`, `scripts/desktop-prepare.ts:44`, `images/agent/Dockerfile:29`
Důkaz: The runner is built with `bun build --compile`, which embeds the whole Bun runtime. `docker history ho/agent:dev` shows the `COPY --chmod=0755 bin/ho-runner` layer at **74.5 MB**, while the same image installs Bun itself in a separate 36.7 MB layer (`/usr/local/bin/bun`, verified present) — so the runtime is in the image twice.
Dopad: Náklady: ~74 MB of every agent image, and of the desktop app's bundled build context, for a 172-line process relay the image's own Bun could run.
Doporučení: Build the runner as a plain bundle (`bun build --target=bun --outfile bin/ho-runner.js`) and set `CMD ["bun", "/usr/local/bin/ho-runner.js"]`. Keep `Bun.version` in the image content hash (`packages/daemon/src/image-context.ts:57`) so a Bun bump still rebuilds. Trade-off to state plainly: the compiled binary pins the exact Bun version inside the artefact, while the bundle relies on the image's Bun — which the same Dockerfile installs and pins by SHA-256, so the guarantee is preserved.
Odhad: střední

### B21.3 – Verified good: bounded channels, log rotation, container limits, WAL tuning

Severita: —
Kde: `packages/core/src/async-channel.ts:13-58`, `packages/sandbox-docker/src/provider.ts:42-51`, `packages/store/src/database.ts:17-21`, `packages/daemon/src/server.ts:103-105`
Důkaz: Every stream goes through a capacity-bounded channel that fails the slow consumer instead of buffering without limit. Containers get `LogConfig` `max-size: 10m, max-file: 2`, `Memory` = `MemorySwap` (no swap), `NanoCpus`, `PidsLimit`, `CapDrop: ALL`, `no-new-privileges`, `ReadonlyRootfs` and `Init: true`. SQLite runs WAL with `synchronous = NORMAL` and `busy_timeout = 5000`, and `close()` checkpoints with `TRUNCATE`. The websocket server sets `maxPayloadLength`, `backpressureLimit` and `closeOnBackpressureLimit`, and the runner enforces its own 4 MiB buffered-amount ceiling and 1 MiB line limit. Careful work; no change needed.
Doporučení: None.

---

## B14 — Deduplication

### B14.1 – The "message from an unknown error" idiom is written out **24 times** in 23 files

Severita: high
Kde: 24 occurrences. Named variants: `describeError` (`packages/ui/src/setup/step.tsx:37`, `packages/ui/src/panels/add-project.tsx:14`), `describe` (`packages/ui/src/panels/settings-intake.tsx:6`, `packages/runtime-acp/src/negotiate.ts:18`, `apps/desktop/src/bun/index.ts:16`). Inline copies: `packages/daemon/src/{sessions,scheduler,gc,intake,boss-voice,mcp,rpc/router}.ts`, `packages/sandbox-docker/src/provider.ts`, `packages/runner/src/main.ts`, `apps/cli/src/main.ts`, `apps/desktop/src/bun/lock.ts`, `scripts/ui-build.ts`, `packages/ui/src/office/office-canvas.tsx` (×2), `packages/ui/src/panels/{chat,resources,settings-agents,settings-projects,settings-token}.tsx`
Důkaz: `git ls-files '*.ts' '*.tsx' | xargs grep -c 'instanceof Error'` → 23 files, 24 hits, every one of the form `x instanceof Error ? x.message : String(x)`.
Dopad: Duplikace: the most-repeated expression in the repository, under five different names.
Doporučení: One `errorMessage(error: unknown): string` exported from `@ho/core` (pure and dependency-free), used everywhere. No library: this is three lines, and the maintained candidates do far more than is wanted.
Odhad: střední

### B14.2 – `boss-voice` builds the "done" status line twice

Severita: low
Kde: `packages/daemon/src/boss-voice.ts:54-56` and `:130-134`
Důkaz: `statusLine()` already returns the "is done" sentence for `to === "done"`, and `onStatus` then re-builds the identical string from the freshly re-read task. The duplication has a real reason (artefacts land after the status change, so the line must use the newer task) but it is expressed by copying the template.
Dopad: Duplikace: two places to change the wording, one dead for every other status.
Doporučení: Re-read the task first, then call `statusLine` once with the fresh task.
Odhad: triviální

### B14.3 – The provider "default effort" rule is implemented three times and disagrees once

Severita: medium
Kde: `packages/core/src/providers.ts:20-27` (`defaultChoice`), `packages/ui/src/panels/agent-fields.tsx:25-34` (`switchProvider`), `packages/ui/src/panels/settings-agents.tsx:54-57` (`effortFor`), and a fourth partial copy at `apps/cli/src/commands/agent.ts:65-67`
Důkaz: All four express "use `medium` if the provider offers it, otherwise the first level it offers" — but the CLI's copy falls back to `"low"` where the others fall back to `"medium"`. So `ho agent add --provider opencode` picks `low` and the UI picks `medium` for the same provider.
Dopad: Duplikace plus a genuine divergence between two clients of the same domain rule.
Doporučení: Use `defaultChoice` from `@ho/core` (it already exists) in all three clients.
**Correction after Wave 2.** Only **three** of the four are the same rule. `settings-agents.tsx`'s `effortFor` expresses a different one — _keep_ the current effort when the new provider offers it, otherwise fall back — which is a migration rule, not a default, and it has a single caller. It stays where it is. `agent-fields.tsx` and the CLI's `add` now call `defaultChoice`, and the CLI's `low`/`medium` divergence is gone: verified live, `ho agent add --provider opencode` records `effort: medium`, and `--effort high` is still honoured.
Odhad: triviální

### B14.4 – `pumpLines` / `pumpText` exist twice

Severita: low
Kde: `packages/runner/src/main.ts:40-77` and `spikes/s6-acp-mock/src/run.ts:10-38`
Důkaz: The spike copies the runner's line and text pumps almost verbatim, dropping the 1 MiB guard. Some duplication in a verification harness is defensible, but here the harness re-implements the plumbing of the thing under test.
Dopad: Duplikace: a change to the line protocol must be mirrored in the spike or the spike stops proving anything.
Doporučení: Export the pumps from a shared module the spike imports.
Odhad: triviální

---

## B16, B17 — Replacing our own logic with libraries

### B16.1 – `scripts/lib/raster.ts` re-implements four operations `sharp` already provides

Severita: medium
Kde: `scripts/lib/raster.ts:64-80` (`opaqueBounds`), `:82-89` (`crop`), `:138-155` (`place`), `:158-164` (`splitStrip`); `sharp` is already used in `scripts/lib/png.ts`
Důkaz: `png.ts` decodes and encodes through `sharp`, then hands raw RGBA to 164 lines of hand-written pixel work. `sharp` provides `.trim()` (bounding box of non-background), `.extract({left,top,width,height})` (crop), `.extend({top,bottom,left,right,background})` (place on a canvas) and `.resize({kernel})` with kernels `nearest|cubic|mitchell|lanczos2|lanczos3|mks2013|mks2021`, all in libvips.
Dopad: Udržovatelnost: ~80 lines of pixel loops that a dependency already in the tree does natively and faster.
Doporučení: Replace `crop`, `place` and `splitStrip` with `extract`/`extend` — exact pixel operations with no resampling, so output stays byte-identical — and `opaqueBounds` with `trim`'s reported offsets.
**Explicitly keep `resample`** (`:95-133`): it is an area-averaging box filter operating in premultiplied alpha specifically so transparent neighbours cannot bleed dark fringes into sprite edges. I could not verify from sharp's documentation that its resize reproduces that byte-for-byte, and changing it would alter the 306 delivered sprite PNGs, which this audit must not do. Replacing it is only safe alongside a deliberate re-import of the art.
Zdroj: https://sharp.pixelplumbing.com/api-resize and /api-operation, read 2026-09-08.

**Correction after Wave 3 — measured, and the recommendation is withdrawn.** A probe ran both
implementations over delivered sprites (16×16 bubbles, 150×172 characters, furniture) and compared bytes:

- `sharp.extract` reproduces `crop` **byte for byte** (`true` on every sprite tried).
- `sharp.extend` reproduces `place` **byte for byte**.
- `sharp.trim` does **not** reproduce `opaqueBounds`. Ours is "the bounding box of pixels with alpha ≥ 16";
  sharp's is "distance from a background colour ≤ threshold", and even with
  `background: rgba(0,0,0,0), threshold: 0` it returned **85×118** and **85×116** where ours returns
  **85×117**, and 14×13 where ours returns 14×14. Substituting it would move sprite content by a row — and
  this audit must not change the 306 delivered PNGs.

So only two of the four are equivalent, and for those the win does not survive contact with the call sites:
`crop`, `place` and `resample` are chained synchronously inside array builders in
`scripts/assets-import.ts:208-229` and `scripts/lib/import-target.ts:150-160`, while sharp's API is async.
Replacing 32 lines of exact `subarray`/`set` copies with ~24 lines of raw↔sharp plumbing plus `await`
propagation through the import pipeline is not an improvement, and `resample` — the one subtle function —
stays ours either way (ADR 003).

**Kept ours, deliberately**, with the equivalence measured rather than assumed. `sharp` remains the
decoder/encoder, which is what it is genuinely better at.
Odhad: střední

### B16.2 – Hand-written type guards where Zod is the house standard

Severita: medium
Kde: `scripts/lib/import-target.ts:170-181`
Důkaz: `isRecord`, `isSize`, `isBox`, `isSidecar` — 12 lines of predicates validating the sprite import sidecar, in a repository whose stated rule is "validate every boundary with Zod" and which does so in nine workspaces. The cause is mechanical (A4.3): `zod` is not a root dependency and `linker = "isolated"` does not hoist it.
Dopad: Konzistence a udržovatelnost: one boundary validated by a weaker mechanism that accepts extra keys and non-finite numbers.
Doporučení: Add `zod` to root devDependencies and replace all four with one schema.
Odhad: triviální

### B16.3 – `proper-lockfile` is abandoned and must be replaced

Severita: high
Kde: `packages/daemon/src/index.ts:3`, `:35`; `apps/desktop/src/bun/lock.ts:1`, `:5`; `packages/daemon/src/mirrors.ts:4`, `:41`
Důkaz: Last npm release **2022-06-24**; last commit to `moxystudio/node-proper-lockfile` **2023-10-25**; 21 open issues; no deprecation notice and the repository is not archived, but there has been no maintenance for nearly three years. Full evidence and the rejected alternatives are in `audit/DEPENDENCIES.md`.
Dopad: Udržovatelnost/bezpečnost: three load-bearing mutual-exclusion sites depend on unmaintained code, against the owner's explicit rule.
Doporučení: Drop it. Use `fs.mkdir` exclusive-create locks (atomic on every POSIX and Windows filesystem) with a staleness check for the two single-instance cases, and an in-process promise chain for the mirror serialisation — which is single-process by construction, since the daemon lock guarantees one daemon per state directory. Removes 2 direct and 3 transitive dependencies.
Zdroj: npm registry + GitHub API, 2026-09-08.
Odhad: střední

### B16.4 – Deliberately keeping our own: `Result`, `uuidv7`, `createChannel`, the A* grid

Severita: —
Kde: `packages/core/src/result.ts`, `packages/core/src/ids.ts:18-33`, `packages/core/src/async-channel.ts`, `packages/sim/src/grid.ts`
Důkaz: `neverthrow` — the obvious `Result` library — has not been released since **2025-02-21** and would replace five lines with a class hierarchy; it fails the activity criterion and loses on merit. `uuid@14.0.2` does offer `v7()`, but `packages/core` deliberately injects `Clock` and `Randomness` so the whole domain replays deterministically from the event log; a library reaching for ambient crypto would trade that property away to delete twenty lines. The hand-rolled UUIDv7 was checked against RFC 9562 (48-bit big-endian milliseconds in bytes 0-5, version nibble `7` in byte 6, variant `10` in byte 8) and is correct. `it-pushable` does not implement the bounded-capacity, fail-the-consumer back-pressure `createChannel` needs and has only 286 k weekly downloads. The A* uses `tinyqueue` for the heap and keeps the rest, which is the right split.
Doporučení: No change. Recorded because B16 asks where a library could take over, and these are the cases where the honest answer is "nothing that meets the criteria".

---

## B19, B24 — Build and Docker

### B24.3 – The image content hash matched **no** files from the build context

Severita: high
Kde: `packages/daemon/src/image-context.ts:15-45` at the audited baseline
Důkaz: Found in Wave 3 while trying to force a build failure. `contextHash` globbed the context with one
brace alternation — `{Dockerfile,.dockerignore,rtk-config.toml,mcp/package*.json,providers/*/package*.json,bin/ho-runner,plugins/**/*}`
— and **Bun 1.4.2's `Glob` silently returns zero matches for a brace group whose members cross a path
separator**. Measured directly:

```
{Dockerfile,rtk-config.toml}                 → 2 files
{Dockerfile,bin/ho-runner}                   → 0 files
{Dockerfile,mcp/package*.json}               → 0 files
{Dockerfile,providers/*/package*.json}       → 0 files
{Dockerfile,plugins/**/*}                    → 0 files
packages/{runner,protocol}/src/**/*.ts       → 15 files   (braces inside one segment are fine)
```

So the hash hashed an empty file list for the context. `contextHash(resources, "git-bridge")` was a
**constant**: appending a line to `images/git-bridge/Dockerfile` left it at
`cd372fb85148700fa88095e3492d3f9f`, `ensureImage` therefore skipped the build, and `ho doctor` reported the
image "up to date". The agent image was equally blind to its own Dockerfile, `rtk-config.toml` and the MCP
and provider `package.json`/`package-lock.json` files; it only ever rebuilt because the _sources_ hash
(`packages/{runner,protocol}/src/**/*.ts`, `bun.lock`, `package.json`, `Bun.version`) happens to use a
pattern Bun handles.
Dopad: The staleness mechanism the product advertises did not work for the thing it exists for. Editing a
Dockerfile, bumping a pinned CLI in `providers/*/package.json` or changing `rtk-config.toml` produced no
rebuild and no warning — agents kept running the old image while `doctor` said everything was current.
Doporučení: One glob per pattern, never a brace group spanning a separator, and choose the patterns per
image instead of globbing everything and filtering. Done in Wave 3 and verified in both directions: a
Dockerfile edit now moves the hash (`1ea8e546… → a63070fd… → 1ea8e546…` for git-bridge, and the same for
the agent's Dockerfile and `rtk-config.toml`), `ho image build` rebuilds, a deliberate `RUN false` fails the
build, and the images report "up to date" again afterwards. Note for the owner: because the hash changes,
every existing image is stale exactly once and rebuilds on the next `ho image build`.
Odhad: střední

### B24.1 – The agent image is 1.76 GB, dominated by one 837 MB apk layer

Severita: medium
Kde: `images/agent/Dockerfile:10-14`
Důkaz: `docker history ho/agent:dev` layer sizes: **837 MB** for the single `apk add` (bash, curl, ca-certificates, libgcc, libstdc++, ripgrep, git, openssh-client, **chromium**, nodejs, npm, ttf-dejavu, ttf-liberation, unzip), 209 MB for the `claude-code` apk, 74.5 MB for `ho-runner`, 72.6 MB for the MCP `npm ci`, 36.7 MB for Bun. Locally the four provider variants total ~7.2 GB (`ho/agent:dev` 1.76 GB, `-opencode` 1.96 GB, `-codex` 1.89 GB, `-gemini-cli` 1.58 GB).
Dopad: Náklady/DX: first-run setup downloads and builds ~1.8 GB before the office can do anything, and each extra provider adds another ~1.6-2 GB.
Doporučení: Two contained wins: (a) B21.2 removes 74.5 MB; (b) chromium is only used when `config.browser.enabled` and the session is not triage (`packages/daemon/src/session-run.ts:178`), so moving chromium, the MCP servers and the fonts into an optional stage the base image does not include would take roughly 900 MB off installations that never use browser tooling. That is a build-graph change with a config flag, so it deserves its own wave.
Odhad: velký

### B24.2 – `bun run devkit` downloads a toolchain from a vendor host on every CI run

Severita: medium
Kde: `scripts/devkit.ts:31-46`, both workflows
Důkaz: The script fetches `https://hutch.blackboard.sh/hutch/builds/<rev>/<platform>/hutch.tar.gz` and verifies a hard-coded SHA-256 before extracting, so the artefact is pinned and integrity-checked — the important part. But it comes from a host that is not a package registry, with no signature, and CI runs it on every push with no cache.
Dopad: Bezpečnost (supply chain): a compromise of that host cannot substitute the artefact (the hash would fail) but can deny CI. There is no mirror and no fallback.
Doporučení: Keep the hash pinning; cache `.tools/hutch-<rev>-<platform>` in CI keyed on the revision so a normal push never touches the host, leaving the download as the cache-miss path.
Odhad: triviální

### B19.1 – `bun run check` does not build anything, so the local gate differs from CI

Severita: low
Kde: `package.json:33`, `.githooks/pre-commit`
Důkaz: `check` is `typecheck && lint && fmt:check && knip`, and the pre-commit hook runs exactly that. The UI bundle, the CLI binary and the runner binary are built only in CI, so a change that typechecks but breaks the bundler (an unresolvable asset import, a Tailwind error) passes the hook and fails in CI.
Dopad: DX: the local gate and the CI gate check different things.
Doporučení: Add `ui:build` to `check` — measured at 1.5 s incrementally, acceptable in a pre-commit hook — or split a `check:full` and document the difference.
Odhad: triviální

### B19.2 – Verified good: staged UI publish, digest pins, deny-all dockerignore, content hashing

Severita: —
Kde: `scripts/ui-build.ts:11-54`, `images/*/.dockerignore`, `packages/daemon/src/image-context.ts`
Důkaz: `ui-build.ts` builds into a `mkdtemp` staging directory and publishes with two `renameSync` calls, restoring the previous bundle if the swap fails, so a failed build never leaves a half-written `dist`. Both `.dockerignore` files are deny-all-then-allowlist. `image-context.ts` hashes exactly the inputs that affect the image (Dockerfile, dockerignore, rtk config, the four `package*.json` pairs, plugins, and in development `packages/{runner,protocol}/src/**`, `bun.lock`, `package.json` and `Bun.version`), so `ensureImage` skips rebuilds correctly and rebuilds when it must. Both base images are digest-pinned, and the Alpine digest was verified in this session to be genuinely 3.24.1 by pulling it and reading `/etc/alpine-release` — the `alpine-minirootfs-3.22.5` layer name visible in `docker history` is an upstream layer-reuse artefact, not the release, so there is **no** tag/digest mismatch.
Doporučení: None.

---

## B20 — Security

### B20.1 – The daemon bearer token is compared with `!==`

Severita: medium
Kde: `packages/daemon/src/server.ts:86`
Důkaz: `if (presented === null || presented.token !== options.token)`. The token is 32 random bytes base64url (`packages/daemon/src/launch.ts:63`), so guessing is infeasible, but the comparison is not constant-time and the endpoint is reachable by anything that can open a loopback socket — including any local process and, via `host.docker.internal`, the agent containers. The runner and MCP gateways avoid the issue by using a `Map` lookup instead of a comparison.
Dopad: Bezpečnost: a timing oracle on the one credential that grants full RPC access. Low exploitability, trivial fix.
Doporučení: a constant-time comparison on equal-length buffers, with a length check first.
**Correction after Wave 5.** The recommendation named `Bun.timingSafeEqual`, which **does not exist** in Bun 1.4.2 — `bun -e 'console.log(typeof Bun.timingSafeEqual)'` prints `undefined`. `node:crypto`'s `timingSafeEqual` is available (`typeof … === "function"`) and is what shipped; it throws on unequal lengths, so the length check stays first. Verified live: the right token still authenticates and a wrong one gets 401.
Odhad: triviální

### B20.2 – `ho.db` is world-readable

Severita: medium
Kde: `packages/daemon/src/index.ts:33`, `packages/store/src/database.ts:17`
Důkaz: Observed modes in a live state directory created by the daemon in this session: `daemon.json` `-rw-------`, but `ho.db`, `ho.db-shm` and `ho.db-wal` are all `-rw-r--r--`. The database holds the whole event log: repository paths, task briefs (up to 20 000 characters), chat messages, agent base prompts. The parent directory is created `0o700`, which protects it in practice — but `mkdir` does not change the mode of a directory that already exists, so a home created by an older build or a different umask leaves the log readable by other local users.
Dopad: Bezpečnost: defence in depth missing on the file that holds everything.
Doporučení: Set restrictive permissions on the database files after `openDatabase`, and re-assert `0700` on the home directory at startup rather than only on creation.
Odhad: triviální

### B20.3 – Volume names are interpolated into Engine API paths without encoding

Severita: low
Kde: `packages/sandbox-docker/src/provider.ts:132`, `packages/sandbox-docker/src/housekeeping.ts:19`
Důkaz: `DELETE /volumes/${ref.name}?force=1` and `DELETE /volumes/${name}` — no `encodeURIComponent`, unlike `createContainer` (`provider.ts:60`) and `imageHash` (`image.ts:12`), which both encode. Volume names are internally generated or returned by Docker's own listing, so there is no injection path today.
Dopad: Bezpečnost: no current exposure; an inconsistency that becomes a bug the moment a name comes from elsewhere.
Doporučení: Encode both.
Odhad: triviální

### B20.4 – Agent sandboxes have unrestricted outbound network access (accepted risk, undocumented)

Severita: medium
Kde: `packages/daemon/src/config.ts:25`, `packages/sandbox-docker/src/provider.ts:33-34`, `packages/daemon/src/git-bridge.ts:24`
Důkaz: Agent containers join a bridge network created with `com.docker.network.bridge.enable_icc: "false"` (so containers cannot talk to each other — good) and get `ExtraHosts: host.docker.internal:host-gateway`. A bridge network NATs to the internet, so an agent can reach any host. That is necessary — the provider CLIs call their vendors' APIs. The git-bridge, by contrast, correctly runs with `network: "none"`.
Dopad: Bezpečnost: an agent running model-generated code can exfiltrate anything in its task volume. The design mitigates this well (no host binds for agent containers, read-only rootfs, `CapDrop: ALL`, credentials only in the child's environment, the repository reaching the sandbox only through a volume the git-bridge populates), but egress itself is open and nothing says so.
Doporučení: Nothing to change inside the current design — record it as an accepted risk in the security section of `docs/ARCHITECTURE.md`, which is where a reader will look. The lever, if it ever needs tightening, is an egress proxy on the `ho-agents` network with a provider-host allowlist; that is a project of its own.
Odhad: vyžaduje rozhodnutí (documented, not implemented)

### B20.5 – Verified good: the credential path, the CSP, the static server, the token in the URL fragment

Severita: —
Kde: `packages/daemon/src/auth.ts`, `packages/daemon/src/static.ts:4-10`, `:26-46`, `packages/daemon/src/server.ts:62-65`, `apps/cli/src/commands/ui.ts:18`, `packages/ui/src/rpc.ts:15-24`
Důkaz: Secrets are read from the store at session start, passed to `channel.spawn` as the child's environment, and never persisted or logged; `SECRET_ENV` maps `github-token` to `null` so it can never enter a sandbox. The static server decodes the path, rejects NUL bytes, resolves against a `realpath`'d root and re-checks `realpath` of the target so a symlink cannot escape, and sets a strict CSP (`default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`) plus `nosniff` and `no-referrer`. Every request is origin-checked. The daemon token travels in the URL **fragment**, which browsers never send to a server, and the page moves it into `sessionStorage` and clears the address bar. `--body`/`--title` reach `gh` as argv, never through a shell. Genuinely careful security work.
Doporučení: None.

---

## B22 — Type safety

### B22.1 – Two `(string & {})` escape hatches widen a union to `string`

Severita: medium
Kde: `packages/core/src/ports.ts:33-37` (`SecretKey`), `packages/core/src/sandbox.ts:59` (`SandboxProvider.id`)
Důkaz: `export type SecretKey = "anthropic-oauth-token" | "anthropic-api-key" | "daemon-token" | (string & {});` — the `(string & {})` member keeps editor autocomplete while accepting any string, so `secrets.get("anthropic-oath-token")` (typo) compiles. `@ho/protocol` already has the real enumeration, `SecretKeyName` (`packages/protocol/src/providers.ts:4-10`), which the RPC layer uses (`packages/daemon/src/rpc/router.ts:124`). The `daemon-token` member is additionally dead: `grep -rn 'daemon-token'` finds only this declaration.
Dopad: Typová bezpečnost: the secret store — the most security-relevant port — accepts arbitrary keys and advertises a key that does not exist.
Doporučení: Type `SecretStore` over `SecretKeyName` and delete `daemon-token`. For `SandboxProvider.id`, `"docker"` alone suffices until a second provider exists.
Odhad: střední

### B22.2 – `MailFlow` weakens a branded id to `string`

Severita: low
Kde: `packages/ui/src/office/mail-flow.ts:15`
Důkaz: `type PendingMail = { mailId: string; taskId: TaskId; floorId: ProjectId; … }` — `mailId` is assigned from `mail.id`, which is `MailItemId`. Two of the three ids in the same type are branded; this one is not, so a `TaskId` could be assigned to it.
Dopad: Typová bezpečnost.
Doporučení: Use `MailItemId`.
Odhad: triviální

### B22.3 – `DistributiveOmit` is hand-written where `type-fest` has it

Severita: low
Kde: `packages/protocol/src/events.ts:108`
Důkaz: `type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;` — correct, but a well-known utility with a single user in this file. `type-fest@5.9.0` (published 2026-08-30, 337.8 M weekly) provides it, and the repository will want `type-fest` anyway for the typed `compact()` of B15.1.
Dopad: Konzistence.
Doporučení: Add `type-fest` as a root devDependency (types only, erased at build) and use it here and in `compact()`.
Zdroj: npm registry, 2026-09-08.
Odhad: triviální

### B22.4 – Verified good: branded ids, discriminated unions, exhaustive switches, zero escape hatches

Severita: —
Kde: `packages/protocol/src/ids.ts`, `packages/protocol/src/events.ts:38-99`, `tsconfig.base.json`
Důkaz: All seven entity ids are Zod-branded UUIDv7 types, so a `TaskId` cannot be passed where an `AgentId` is expected. Domain events, actors, repo sources, task sources and runtime events are all discriminated unions, and `typescript/switch-exhaustiveness-check` is on, so adding an event type is a compile error at every fold. The compiler runs with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`, `erasableSyntaxOnly` and `isolatedModules`. The whole tree contains **no** `any`, `@ts-ignore`, `@ts-expect-error` or non-null assertion (verified by grep; recorded in `audit/SUPPRESSIONS.md`). A stronger type baseline than most TypeScript codebases reach.
Doporučení: None beyond B22.1-3.

---

## B23 — Monorepo setup

### B23.1 – The typecheck pool is hand-written where incremental builds would do the work

Severita: medium
Kde: `scripts/typecheck.ts:13-30`
Důkaz: A 4-way concurrency pool is implemented with `Array.from({length}, async () => { while (pending.length) … })`. It works, but TypeScript 7 supports `incremental` (A1.4), which removes most of the work the pool is scheduling.
Dopad: Udržovatelnost: bespoke scheduling in a build script.
Doporučení: Keep the script — it produces the `✔ / ✖` summary and a stable ordering that `bun run --filter` does not — but add `incremental` per A1.4. Rejecting `--filter` here is deliberate: it would put a `typecheck` script in all 16 workspaces to replace 18 lines in one place.
Odhad: triviální

### B23.2 – Verified good: the version catalog, the isolated linker, exact pins, Dependabot coverage

Severita: —
Kde: `package.json:6-51`, `bunfig.toml`, `.github/dependabot.yml`
Důkaz: Every shared dependency version is declared once in `workspaces.catalog` and referenced as `catalog:`, so version drift between packages is structurally impossible — which is exactly what `syncpack` and `sherif` exist to police, and why they were rejected in `audit/DEPENDENCIES.md`. `linker = "isolated"` plus `exact = true` means no phantom dependencies and no ranges. Dependabot covers all four ecosystems present (bun, github-actions, docker ×2, npm ×4) with grouped weekly updates. `bun install --frozen-lockfile` reproduces in 28 ms.
Doporučení: None.

---

## B25 — Experimental choices, and what a dead end would cost

Each entry states the reversal cost, as the task requires.

### B25.1 – `useEffectEvent` from React (documented as Canary/Experimental)

Kde: `packages/ui/src/panels/add-project.tsx:2`, `:41`
Důkaz: `import { useEffect, useEffectEvent, useState } from "react"` — and it resolves: `typeof React.useEffectEvent === "function"` on the pinned `react@19.2.8` (checked in this session). react.dev still titles the page "This feature is available in the latest Canary version of React".
Dead end? If the export is renamed or removed the build breaks loudly at import time, not silently.
Cost: Trivial. It is used once, to keep `onFound` out of an effect's dependency list; the pre-hook idiom (a `useRef` holding the latest callback) is about six lines.
Verdict: Keep.

### B25.2 – `Bun.secrets` (documented as "new and experimental")

Kde: `packages/secrets/src/keychain.ts`
Důkaz: https://bun.com/docs/runtime/secrets.md, read 2026-09-08: "This API is new and experimental. It may change in the future."
Dead end? A signature change breaks one 10-line file.
Cost: Trivial, and the fallback already exists — `createFileSecretStore` implements the same `SecretStore` port, so `auto` can degrade to it.
Verdict: Keep (and see B13.2 for making that degradation automatic instead of platform-based).

### B25.3 – `reactCompiler: true` in the UI bundler

Kde: `scripts/ui-build.ts:21`
Důkaz: Bun's bundler runs the React Compiler over the UI. The compiler is what makes the inline JSX handlers in the panels acceptable, and is why the `react-perf` lint rules were rejected in A1.3.
Dead end? If the compiler miscompiles, the symptom is a subtle render bug rather than a build failure — the worst failure mode of the three.
Cost: One line to disable, but then the memoisation the panels rely on has to be written by hand, which is real work.
Verdict: Keep, and record it in `docs/STACK.md` so the next reader knows why there is no `useCallback` anywhere.

### B25.4 – Electrobun + Hutch as the desktop shell

Kde: `apps/desktop/**`, `scripts/devkit.ts`
Důkaz: `electrobun@2.0.1` published 2026-09-08; `blackboardsh/electrobun` pushed 2026-09-08, 12 767 stars, 112 open issues, MIT. Actively developed but young, and 50.5 k weekly downloads is small beside Electron or Tauri. Hutch is fetched from a vendor host (B24.2).
Dead end? The daemon and the UI are both plain web/Bun code served over HTTP; the desktop shell is 5 files and ~350 lines.
Cost: Moderate but bounded — the office already runs in any browser via `ho ui`, so the fallback is "no desktop shell", and porting the shell to Tauri or Electron is a small, contained job.
Verdict: Keep. The architecture genuinely limits the exposure.

### B25.5 – `--effort ultracode`, available and deliberately unused

Kde: `packages/protocol/src/domain.ts:32` (`EffortLevel`)
Důkaz: The Claude Code CLI reference documents `--effort` as accepting `low, medium, high, xhigh, max, ultracode`, with `ultracode` requiring v2.1.203+. The image pins `claude-code=2.1.263-r1`, so it is available. `EffortLevel` stops at `max`.
Dead end? Adding an enum value is a persisted-event change: agents created with `effort: "ultracode"` would fail validation if the level were later removed.
Cost: Low but not free — it needs a migration path in `validateChoice`.
Verdict: **Do not add** in this audit. The documentation states the version requirement but not the semantics or the cost profile, and guessing at a spend-affecting knob is exactly what this audit must not do. Recorded as a deliberate omission.
Zdroj: https://code.claude.com/docs/en/cli-reference, read 2026-09-08.

---

## B26 — Stricter, but not misleading, rules

Covered by A1.1-A1.3 (oxlint) and A1.4/A1.6 (TypeScript). The four rules deliberately **left off** —
`react-perf/*`, `typescript/promise-function-async`, `unicorn/no-null`, `oxc/no-barrel-file` — are recorded
in A1.3 with the reason each would force worse code, so that "strict" does not slide into "misleading".

---

## B27 — Tools the monorepo is missing

### B27.1 – Nothing verifies that the daemon starts, in CI or locally

Covered by A2.2. The single most valuable missing check.

### B27.2 – Rejected additions, each with its reason

Severita: —
Důkaz: `syncpack`/`sherif` — the `catalog:` mechanism already makes version drift impossible. `taze` — Dependabot already does it, weekly, for all four ecosystems. `publint` — checks published package shape; every workspace is `private: true`. `lefthook` — the hook is three lines and works. `ora`/spinners — the only long command already streams output line by line. `cli-table3` — unmaintained for 28 months, for five `padEnd` call sites. Full evidence in `audit/DEPENDENCIES.md`.
Doporučení: Add only `type-fest` (types), `yoctocolors` and `@clack/prompts` (CLI), plus the CI smoke step.

---

## B28 — Dead code and files

### B28.1 – A 62 MB abandoned build artefact in the repository root

Covered by A1.8.

### B28.2 – Four unused exports that knip cannot see

Severita: low
Kde: `packages/protocol/src/mcp.ts:91-97` (`McpAgentSummary`), `packages/core/src/ports.ts:36` (`"daemon-token"`), `packages/core/src/runtime.ts:17` (`RuntimeCapabilities.images`), `packages/core/src/sandbox.ts:8` (`ImageSpec.dockerfile`)
Důkaz: `grep -rn` finds no consumer for `McpAgentSummary` (the MCP tool builds its result inline at `packages/daemon/src/mcp.ts:128-134`) or for the `"daemon-token"` secret key. `RuntimeCapabilities.images` is set by both runtimes and read by nobody. `ImageSpec.dockerfile` is optional, never set, and read once in `buildImage`. Knip does not flag them because they are exported from barrel files it treats as entry points.
Dopad: Udržovatelnost: type surface implying capabilities that do not exist.
Doporučení: Delete `McpAgentSummary` and `"daemon-token"`; keep `ImageSpec.dockerfile` (a legitimate provider-port option) and decide on `capabilities().images` — either use it to gate image inputs or drop it.
Odhad: triviální

### B28.3 – A previous audit report in the documentation tree

Covered by A3.2.

---

## B30 — Protocol communication

### B30.1 – ACP `usage_update` is dropped, so ACP sessions report no usage at all

Severita: high
Kde: `packages/runtime-acp/src/events.ts:23-56`
Důkaz: `updateToEvents` handles exactly three of the fifteen `SessionUpdate` variants the installed SDK declares (`agent_message_chunk`, `tool_call`, `tool_call_update`) and returns `[]` for everything else. Read from the installed `@agentclientprotocol/sdk@1.4.0` type surface in this session, the stable v1 schema also carries `usage_update`, whose payload is `UsageUpdate = { used: number; size: number; cost?: Cost | null }`, documented as "Context window and cost update for a session" — `used` = tokens currently in context, `size` = context window size, `cost` = cumulative session cost. Also unhandled: `agent_thought_chunk`, `plan`/`plan_update`/`plan_removed`, `current_mode_update`, `session_info_update`, `available_commands_update`, `compaction_update`/`compaction_summary_chunk`, `config_option_update`, `user_message_chunk`.
Dopad: For OpenCode, Gemini CLI and Codex sessions the Usage panel and `ho usage` report zeros with no explanation, so the token economy the product is built around is blind for three of its four providers — and the cumulative session **cost** the agents do report is thrown away.
Doporučení: Do **not** map `used` onto `Usage.inputTokens` — that is exactly the misleading naming B13 forbids, since `used` is a context-window level, not an incremental input count. Add a first-class runtime event for context and cost, surface it in the Inspector, and state in the Usage panel that ACP providers report context and cost rather than a token split. Handling `agent_thought_chunk` and `plan` updates is a separate, smaller opportunity.
Zdroj: `node_modules/.bun/@agentclientprotocol+sdk@1.4.0…/dist/schema/types.gen.d.ts:3939-3965`, read 2026-09-08.
Odhad: střední

### B30.2 – `PROTOCOL_VERSION` is duplicated instead of imported

Severita: low
Kde: `packages/runtime-acp/src/negotiate.ts:5`
Důkaz: `const PROTOCOL_VERSION = 1;`. The SDK exports the constant (`dist/acp.d.ts:5` re-exports it from `./schema/index.js`, where `export const PROTOCOL_VERSION = 1`), so the local value is correct today — but an SDK bump would leave the repository silently negotiating the old version. The SDK does ship a v2 surface, behind the `./experimental/v2` subpath with a `schema.unstable.json`; adopting it is **not** recommended while it is labelled unstable.
Dopad: Udržovatelnost: a hardcoded protocol number that will drift.
Doporučení: Import `PROTOCOL_VERSION` from the SDK.
Odhad: triviální

### B30.3 – `AUTH_REQUIRED = -32000` is a bare protocol constant

Severita: low
Kde: `packages/runtime-acp/src/negotiate.ts:6`, `:15-16`
Důkaz: The auth-required error is detected by comparing `error.code === -32000` against a locally declared constant with no provenance in the code.
Dopad: Udržovatelnost.
Doporučení: Use the SDK's error helpers if it exports any; otherwise keep the constant but name it after the spec section it comes from.
Odhad: triviální

### B30.4 – `events.subscribe` skips the bridge for exactly one event

Severita: low
Kde: `packages/ui/src/sync.ts:20-30`, `packages/daemon/src/rpc/router.ts:241-255`
Důkaz: The server subscribes to live events _before_ replaying and dedupes with `if (event.seq > last)` — correct. The client treats the event whose `seq >= head.seq` as the replay boundary, flips `replayed` and calls `bridge.syncFromModel()` for it, but **not** `bridge.onEvent(event)`. So that one event is applied to the model and never reaches the simulation bridge.
Dopad: Správnost: if the boundary event is a `handoff.requested` or `mail.received`, its office animation is skipped — a rare, invisible one-event gap.
Doporučení: After flipping `replayed`, also dispatch that event to `bridge.onEvent`.
Odhad: triviální

### B30.5 – Verified good: the three transport surfaces

Severita: —
Kde: `packages/daemon/src/server.ts`, `packages/protocol/src/contract.ts`, `packages/protocol/src/runner.ts`, `packages/sandbox-docker/src/api.ts`
Důkaz: One oRPC contract shared by daemon, UI and CLI, so the wire format cannot drift between clients; typed errors (`NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION`) declared in the contract and mapped from domain errors by one middleware; event iterators for the three streams; the token accepted either as a header or as a `ho.bearer.*` subprotocol, with the selected subprotocol correctly echoed on the upgrade response. The runner protocol is a small discriminated union `safeParse`d on every frame, with a hello-first state machine that closes the socket on any out-of-order message. Docker responses are Zod-validated field by field, and the multiplexed log stream is demuxed correctly (8-byte header, big-endian length). This layer is in good shape.
Doporučení: None beyond B30.1-4.

---

## B31 — External tools

### B31.1 – Verified: the Docker Engine API pin is deliberate and still valid

Severita: —
Kde: `packages/sandbox-docker/src/api.ts:5`, `packages/ui/src/setup/status.ts:4`
Důkaz: `const API = "v1.44"` and `MIN_DOCKER_API = 1.44`. The local Docker reports `serverAPI: 1.55`, `serverMinAPI: 1.40`, `serverVersion: 29.7.2`, so v1.44 is accepted and will keep being accepted. Pinning an API version is correct practice, and the comment in `status.ts` explains the choice (Docker Desktop 4.27+/Engine 25+).
Doporučení: No change. Recorded so B31 has an examined answer rather than an assumption.
Zdroj: `docker version --format '{{json .}}'`, 2026-09-08.

### B31.2 – The GitHub issues query sends an empty `labels=` parameter by default

Severita: medium
Kde: `packages/intake-github/src/index.ts:57`, `:65`
Důkaz: `const labels = encodeURIComponent(project.intake.labels.join(","));` then `repos/${repo}/issues?state=open&per_page=100&labels=${labels}`. `IntakePolicy.labels` defaults to `[]` (`packages/protocol/src/domain.ts:102`) and the field is documented as "empty takes every open issue", so the default poll sends `labels=` with an empty value. GitHub treats `labels` as a comma-separated filter; an empty value is not a documented spelling for "no filter", and this audit did not exercise the endpoint to determine what it returns.
Dopad: Správnost: the default intake configuration may silently return nothing, and the failure mode ("no issues arrive") looks exactly like "no issues exist".
Doporučení: Omit the parameter entirely when the list is empty — unambiguous regardless of how GitHub interprets an empty value, and it costs one conditional.
Odhad: triviální

### B31.3 – Every poll rescans all mail to build the dedupe set

Severita: low
Kde: `packages/daemon/src/intake.ts:209-213`
Důkaz: `new Set([...this.#office.model.mail.values()].filter(m => m.projectId === project.id).map(m => m.externalId))` — a full scan of the mail projection per project per poll, and polls run as often as every 30 seconds (`IntakePolicy.intervalSeconds` minimum).
Dopad: Výkon: O(all mail ever) per poll, growing forever.
Doporučení: Use one of the projection indexes from B4.1.
Odhad: triviální

### B31.4 – Verified good: subprocess discipline and PATH widening

Severita: —
Kde: `packages/daemon/src/{publish,mirrors,repo-inspect}.ts`, `packages/intake-github/src/gh.ts`, `apps/desktop/src/bun/path.ts`
Důkaz: Every external process is spawned with `Bun.spawn([argv])` — an array, never a shell string — with an explicit `timeout`, `GIT_TERMINAL_PROMPT: "0"` and `GH_PROMPT_DISABLED: "1"` so nothing can block on a prompt, and stdout/stderr both drained concurrently with `proc.exited` so a full pipe cannot deadlock. Agent-controlled text reaches `gh` only as `--body`/`--title` argv values. And `apps/desktop/src/bun/path.ts` already solves the problem I went looking for: a Finder-launched app inherits a minimal PATH without `docker` or `gh`, and `widenPath()` appends `/usr/local/bin`, `/opt/homebrew/bin`, `~/.docker/bin` and `~/.bun/bin` when they exist. Nothing to fix.
Doporučení: None.

---

## B32 — Configuration correctness

Covered by A1 (lint, format, knip, tsconfig, bunfig), A2 (workflows), A4 (Bun and the catalog), B24
(Docker) and B33 (the agent's own configuration). Every configuration file listed in
`audit/INVENTORY.md` §3 has either a finding or an explicit "verified, no change" entry.

---

## B33 — The agent's configuration, cost-effectiveness and reasoning

### B33.1 – `includeCoAuthoredBy` has been deprecated since Claude Code v2.0.62

Severita: high
Kde: `packages/runtime-claude-code/src/command.ts:9`
Důkaz: `CLAUDE_SETTINGS`, passed inline via `--settings`, sets `includeCoAuthoredBy: false`. The official settings reference states: "Deprecated since v2.0.62, when `attribution` replaced it. Claude Code still reads it, but new configurations should set `attribution`" — and further, "Claude Code ignores the deprecated `includeCoAuthoredBy` setting … once you set `attribution.commit` or `attribution.pr`." The image pins `claude-code=2.1.263-r1`, well past 2.0.62.
Dopad: Správnost: it still works, but it is deprecated configuration on a pinned-and-updated CLI, and it only controls the commit trailer — the pull-request attribution text and the claude.ai session link are untouched, so HO's commits and PRs carry attribution the setting was meant to suppress.
Doporučení: Replace with `attribution: { commit: "", pr: "", sessionUrl: false }`, which the reference gives as the documented way to hide all attribution.
Zdroj: https://code.claude.com/docs/en/settings-reference.md §`includeCoAuthoredBy`, §`attribution`, read 2026-09-08.
Odhad: triviální

### B33.2 – `includeGitInstructions` is unset, so every session pays for guidance that contradicts our own prompt

Severita: high
Kde: `packages/runtime-claude-code/src/command.ts:8-19`, `packages/daemon/src/prompts.ts:19-24`, `:33-42`
Důkaz: The official reference for `includeGitInstructions` (default `true`): "At session start, Claude Code adds two git-related pieces to Claude's prompt: its built-in instructions for how to write commits and pull requests, in the Bash tool's description, and a git status snapshot of your repository in the system prompt, meaning the current branch, the main branch, `git status` output, and recent commits. Set this key to `false` to leave both out, for example when you use your own git workflow skills."
Home Office has exactly its own git workflow and states it: `workProtocol` says "Do not push; do not open pull requests; do not leave uncommitted changes when you report", and `workPrompt` already tells the agent the checkout path and the branch. The built-in block is therefore both redundant with what HO supplies and partly contradictory, since it instructs the model on opening pull requests — which HO forbids and performs itself in `packages/daemon/src/publish.ts`.
Dopad: Náklady a kvalita: paid input tokens on every turn of every session across all agents, plus a direct conflict between the vendor's system prompt and ours — precisely the kind of conflict that produces an agent trying to `git push`.
Doporučení: Set `includeGitInstructions: false` in `CLAUDE_SETTINGS`.
Zdroj: https://code.claude.com/docs/en/settings-reference.md §`includeGitInstructions`, read 2026-09-08.
Odhad: triviální

### B33.3 – `autoUpdatesChannel` is dead configuration inside the sandbox

Severita: low
Kde: `packages/runtime-claude-code/src/command.ts:10`
Důkaz: `CLAUDE_SETTINGS.autoUpdatesChannel: "stable"` selects which release channel _background auto-updates and `claude update`_ follow. The same settings object sets `env.DISABLE_AUTOUPDATER: "1"`, and the reference says "To turn auto-updates off entirely, set `DISABLE_AUTOUPDATER` in `env`." The binary is additionally installed by apk at a pinned version into a read-only rootfs, so it cannot update itself in any case.
Dopad: Udržovatelnost: a setting that does nothing, sent on every session, implying updates are managed when they are pinned.
Doporučení: Remove the key.
Zdroj: https://code.claude.com/docs/en/settings-reference.md §`autoUpdatesChannel`, read 2026-09-08.
Odhad: triviální

### B33.4 – The effort defaults are inverted relative to the vendor's guidance

Severita: medium
Kde: `packages/core/src/commands/office-defaults.ts:14` (boss `high`), `packages/core/src/providers.ts:25` (everyone else `medium`), `packages/ui/src/panels/settings-agents.tsx:20-25`
Důkaz: The boss is created at `effort: "high"`; every other agent defaults to `medium` through `defaultChoice`. Two vendor statements bear on this: the CLI reference lists `--effort low|medium|high|xhigh|max|ultracode` and notes that available levels depend on the model; and the current Claude guidance (bundled `claude-api` skill, cached 2026-06-24) states that `xhigh` "is the best setting for most coding and agentic use cases … and the default in Claude Code", that "effort matters more on those models than on any prior model in their tier", to "run long-horizon/agentic tasks at `high`/`xhigh` with the full task spec given up front", and to use "a minimum of `high` for intelligence-sensitive work … and `low` for subagents or simple tasks". It also notes that lower effort produces "fewer and more-consolidated tool calls, less preamble".
Dopad: Kvalita vs. náklady: workers — the agents that actually change the repository — run at `medium`, below the stated minimum for intelligence-sensitive work, while the boss, whose job is triage and delegation (a shorter, cheaper task), runs higher.
Doporučení: Default workers and reviewers to `high` and the boss's triage to `medium`, leaving `xhigh` as a deliberate opt-in for hard tasks. Effort is per agent and editable in Settings, so this only moves the defaults; state the reasoning in the agent editor's help text.
Zdroj: https://code.claude.com/docs/en/cli-reference, read 2026-09-08; bundled `claude-api` skill effort guidance.
Odhad: střední (a defaults change with a cost implication — worth the owner's eye)

### B33.5 – `BASH_MAX_OUTPUT_LENGTH` is the one unused token lever worth setting

Severita: medium
Kde: `packages/runtime-claude-code/src/command.ts:11-18`, `images/agent/rtk-config.toml`
Důkaz: The env-var reference documents (each confirmed present by grep over the fetched page) `BASH_MAX_OUTPUT_LENGTH` — "Maximum characters of bash output read (default: 30000; max: 150000)" — as well as `MAX_THINKING_TOKENS`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` and `DISABLE_COST_WARNINGS`. `CLAUDE_SETTINGS.env` sets six variables, none of them these. The image already installs RTK with `tee.mode = "failures"` specifically to cut command-output tokens, so the intent exists — but RTK compresses _known_ commands (its exclude list is `curl` and `claude`), while `BASH_MAX_OUTPUT_LENGTH` bounds everything else.
Dopad: Náklady: a single `bun run check` or `docker build` inside a sandbox can pour 30 000 characters into the context on top of what RTK does not cover.
Doporučení: Set `BASH_MAX_OUTPUT_LENGTH` lower (10 000 is ample for a pass/fail signal, and RTK's tee keeps the full output on tmpfs for deliberate inspection — exactly the pattern `rtk-config.toml` sets up). Leave `MAX_THINKING_TOKENS` unset: with adaptive thinking, `--effort` is the documented lever and a hard thinking cap fights it. Leave `CLAUDE_CODE_MAX_OUTPUT_TOKENS` unset: the report is already capped at 1 500 characters by `HoReportInput`.
Zdroj: https://code.claude.com/docs/en/env-vars.md, read 2026-09-08.
Odhad: triviální

### B33.6 – The model catalogue omits the `fable` alias the CLI accepts

Severita: medium
Kde: `packages/protocol/src/providers.ts:49-53`
Důkaz: The Claude Code catalogue offers `opus`, `sonnet`, `haiku`. The CLI reference documents `--model` as accepting "Model alias (`sonnet`, `opus`, `haiku`, `fable`) or full model name", and the env-var reference documents `ANTHROPIC_DEFAULT_FABLE_MODEL` alongside the opus/sonnet/haiku alias overrides — so `fable` is a first-class alias. Nothing in the catalogue is _wrong_: `anthropic/claude-sonnet-5` and `anthropic/claude-haiku-4-5` in the OpenCode entry are both current model ids.
Dopad: Schopnosti: the office cannot be pointed at the top tier from the picker, though `freeFormModels: true` does let a user type a raw id — so the catalogue is incomplete rather than blocking.
Doporučení: Add `{ id: "fable", label: "Fable (latest)" }` to the Claude Code models list. Do not touch the defaults: Fable's pricing is materially higher and that is the owner's call, not the auditor's.
Zdroj: https://code.claude.com/docs/en/cli-reference and /env-vars.md, read 2026-09-08; bundled `claude-api` skill model table.
Odhad: triviální

### B33.7 – Verified good: every other flag and environment variable checks out

Severita: —
Kde: `packages/runtime-claude-code/src/command.ts:37-89`, `images/agent/Dockerfile:47-62`, `images/agent/rtk-config.toml`
Důkaz: Every flag in `claudeArgv` was checked against the CLI reference and **all exist with the values used**: `-p`, `--input-format stream-json`, `--output-format stream-json`, `--verbose`, `--include-partial-messages` (documented as requiring `-p` and stream-json — both present), `--model`, `--effort`, `--max-turns`, `--permission-mode bypassPermissions`, `--setting-sources user`, `--settings <inline JSON>` (documented as accepting inline JSON up to 2 MiB), `--strict-mcp-config`, `--name`, `--session-id <UUID>` (a `crypto.randomUUID()` is passed), `--resume`, `--max-budget-usd` (print mode only, and only added when `auth === "api-key"`), `--append-system-prompt`, `--mcp-config`, `--plugin-dir` (repeatable). Every environment variable in `CLAUDE_SETTINGS.env` and in the image's `ENV` block was confirmed present in the official env-var reference: `DISABLE_AUTOUPDATER`, `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `ENABLE_CLAUDEAI_MCP_SERVERS`, `USE_BUILTIN_RIPGREP`, `CLAUDE_CONFIG_DIR`. `--setting-sources user` combined with `rtk init -g --hook-only` writing the RTK PreToolUse hook into the image's user settings is a correct arrangement, accurately described by the comment at `command.ts:5-6`. RTK itself is a live project (79 508 stars, pushed 2026-09-08). `DO_NOT_TRACK=1`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and `PUPPETEER_SKIP_DOWNLOAD=1` are all set. This is well-researched configuration; the six findings above are the exceptions.
Doporučení: None beyond B33.1-6.

---

## C1–C5

Each is answered by its own ADR under `audit/adr/`, as the task requires.

| Point | Question                                     | Recommendation                                                                        | ADR                              |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| C1    | Does the project need a framework migration? | **No.** Keep the current shape.                                                       | `adr/001-framework-migration.md` |
| C2    | Is PixiJS still the right engine?            | **Yes.** Keep PixiJS 8.                                                               | `adr/002-render-engine.md`       |
| C3    | How should sprites be handled?               | Keep the pipeline; move the exact pixel operations onto `sharp`; add a texture atlas. | `adr/003-sprite-pipeline.md`     |
| C4    | What in the current setup holds up?          | Almost all of it; five specific items do not.                                         | `adr/004-stack-review.md`        |
| C5    | Where could a library do the work?           | One clear win, two CLI wins, one replacement, four deliberate keeps.                  | `adr/005-library-candidates.md`  |
| B5.1  | Should the CLI adopt a framework?            | Declarative command table, no framework.                                              | `adr/006-cli-framework.md`       |
