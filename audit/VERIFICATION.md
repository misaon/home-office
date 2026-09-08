# Verification log

Real commands and real output, appended per wave. No paraphrase. Machine: macOS 25.6.0 (darwin arm64),
Bun 1.4.2, Node 24.14.0, Docker 29.7.2, gh 2.100.0.

## How the UI is verified in this session (important)

The Claude Browser pane reports `document.hidden === true`, and
`packages/ui/src/office/office-canvas.tsx` deliberately stops the PixiJS ticker while the document is
hidden. A screenshot taken straight after load therefore shows a **black canvas even when everything
works**. Confirmed by instrumentation, not assumed:

```
> JSON.stringify({hidden: document.hidden, visibilityState: document.visibilityState, hasFocus: document.hasFocus()})
"{\"hidden\":true,\"visibilityState\":\"hidden\",\"hasFocus\":false}"

> const h=window.__ho, sc=h.scene; … {"floors":["01a08277-…"],
  "actors":[{"kind":"receptionist","x":17,"y":25,…},{"kind":"boss","x":6,"y":6,…}],
  "layoutIssues":[], "screen":[1040,873], "innerKids":0, "ticking":false}
```

`ticking:false` and `innerKids:0` with a populated world is the signature. The UI verification procedure
for every wave is therefore:

1. `bun run ui:watch` (a development bundle; `scripts/ui-build.ts` only defines
   `process.env.NODE_ENV="development"` in watch mode, which is what exposes `window.__ho`),
2. load `http://127.0.0.1:<port>/#token=…`, wait for the bundle (10.3 MB in dev — needs >10 s),
3. `window.__ho.bridge.setWatching(true); window.__ho.scene.app.ticker.start()`,
4. screenshot and inspect `window.__ho.bridge.world`.

---

## Wave 0 — baseline (commit `ecd4aa5`, before any change)

### `bun install --frozen-lockfile`

```
bun install v1.4.2 (744846f84)
Checked 235 installs across 388 packages (no changes) [28.00ms]
```

### `bun run check`

```
$ bun run typecheck && bun run lint && bun run fmt:check && bun run knip
$ bun run scripts/typecheck.ts
✔ apps/cli/tsconfig.json
✔ apps/desktop/tsconfig.json
✔ packages/core/tsconfig.json
✔ packages/daemon/tsconfig.json
✔ packages/intake-github/tsconfig.json
✔ packages/protocol/tsconfig.json
✔ packages/runner/tsconfig.json
✔ packages/runtime-acp/tsconfig.json
✔ packages/runtime-claude-code/tsconfig.json
✔ packages/sandbox-docker/tsconfig.json
✔ packages/secrets/tsconfig.json
✔ packages/sim/tsconfig.json
✔ packages/store/tsconfig.json
✔ packages/ui/tsconfig.json
✔ spikes/s6-acp-mock/tsconfig.json
✔ tsconfig.json
$ oxlint --type-aware --deny-warnings
$ oxfmt --check
Checking formatting...
Finished in 259ms on 291 files using 12 threads.
$ knip
```

(oxlint, oxfmt and knip all silent = clean. Wall clock for the whole pipeline: 2.3 s.)

**oxlint was proved to actually lint**, not merely exit 0, with a throw-away probe file:

```
$ printf 'export const x = (): number => {\n  console.log("nope");\n  return 1 == 1 ? 1 : 2;\n};\n' > packages/core/src/zzz-lint-probe.ts
$ bunx oxlint --type-aware packages/core/src/zzz-lint-probe.ts
packages/core/src/zzz-lint-probe.ts:2:3: error eslint(no-console): Unexpected console statement.
packages/core/src/zzz-lint-probe.ts:3:10: error eslint(no-constant-condition): Unexpected constant condition
packages/core/src/zzz-lint-probe.ts:3:12: error eslint(eqeqeq): Expected === and instead saw ==
packages/core/src/zzz-lint-probe.ts:3:10: error eslint(no-self-compare): Both sides of this comparison are exactly the same
packages/core/src/zzz-lint-probe.ts:2:3: error typescript(no-unsafe-call): Unsafe call of a(n) `error` type typed value.
packages/core/src/zzz-lint-probe.ts:2:11: error typescript(no-unsafe-member-access): Unsafe member access .log on an `error` typed value.
packages/core/src/zzz-lint-probe.ts:3:10: error typescript(no-unnecessary-condition): Unnecessary comparison between literal values.
$ rm packages/core/src/zzz-lint-probe.ts
```

### `bun audit`

```
bun audit v1.4.2 (744846f84)
No vulnerabilities found (checked 367 packages) [267.00ms]
```

### Builds

```
$ bun run ui:build
ui: 3 files, 1100 KiB → /Users/ondrejmisak/WebstormProjects/home-office/packages/ui/dist

$ bun run assets:manifest
  … furniture/bushes            4 × 2    cells = 96 × 48    px  ×1     (43 sprite keys)

$ bun build --compile apps/cli/src/main.ts --outfile /tmp/ho-baseline
  [30ms]  bundle  550 modules
  [85ms] compile  /tmp/ho-baseline

$ bun build --compile --minify --target=bun-linux-arm64-musl packages/runner/src/main.ts --outfile /tmp/ho-runner-baseline
   [5ms]  minify  -0.84 MB (estimate)
   [2ms]  bundle  121 modules
  [62ms] compile  /tmp/ho-runner-baseline bun-linux-aarch64-musl-v1.4.2
```

### Application actually started

CLI:

```
$ HO_HOME=/tmp/ho-audit-baseline /tmp/ho-baseline doctor
ho: no running daemon found (/tmp/ho-audit-baseline/daemon.json missing); start one with `ho daemon`
$ /tmp/ho-baseline --help          → full 40-line usage, exit 0
```

Daemon:

```
{"level":30,"time":1788895247995,"app":"ho","events":0,"lastSeq":-1,"msg":"read model rebuilt"}
{"level":30,"time":1788895247996,"app":"ho","host":"127.0.0.1","port":47800,"msg":"rpc server listening"}
{"level":30,"time":1788895247999,"app":"ho","home":"/tmp/ho-audit-baseline","resources":"…/home-office","msg":"daemon started"}
daemon 0.0.0-dev listening on 127.0.0.1:47800 (pid 26100)
office UI: http://127.0.0.1:47800/ — the token is in daemon.json (0600); `ho ui` opens the UI with it
```

State-file modes actually on disk:

```
-rw-------  daemon.json
drwxr-xr-x  daemon.lock
-rw-r--r--  ho.db          ← not 0600 (see AUDIT B20)
-rw-r--r--  ho.db-shm
-rw-r--r--  ho.db-wal
```

Project creation through the CLI worked and produced a floor with the boss:

```
$ ho project add "Audit Repo" --path …/home-office   → Project JSON, id 01a08277-…
$ ho agent list
01a08277-c13a-74d2-a1a2-d733cf9350f4  Andrew  boss  claude-code/opus@high (subscription)  skills=boss  floor=Audit Repo
```

UI: 251 asset requests all `200 OK`; after starting the ticker by hand (see procedure above) the office
renders in full — floor tiles, walls, desks, plants, the elevator, the spa, Andrew at his desk and Lola at
the reception. Screenshot captured. `bridge.layoutIssues` was `[]`.

### Not yet run at baseline

`docker build` of `images/agent` — deferred to the Wave 5 record because the `rtk` stage compiles a Rust
binary from git; the git-bridge image is built in the same step.

---

## Wave 1 — foundation

### `bun install --frozen-lockfile`

```
bun install v1.4.2 (744846f84)
Checked 235 installs across 388 packages (no changes) [7.00ms]
```

### `bun run check` — green

```
$ bun run typecheck && bun run lint && bun run fmt:check && bun run knip
$ bun run scripts/typecheck.ts          (16 × ✔, all projects)
$ oxlint --type-aware --deny-warnings   (silent — 9 new rules, 2 scoped overrides)
$ oxfmt --check
All matched files use the correct format.
Finished in 323ms on 305 files using 12 threads.
$ knip
CHECK EXIT: 0
```

### A1.4 measured: `incremental` on the typecheck

```
cache files: 16, size: 3.6M      (.tscache/, git-ignored)
cold (cache parked aside):  9.86s user  1.92s system  833% cpu  1.414 total
warm 1:                     3.33s user  1.31s system  837% cpu  0.554 total
warm 2:                     3.39s user  1.27s system  944% cpu  0.493 total
git sees .tscache?  no (ignored)
```

Warm typechecks cost **3.33 s user CPU instead of 9.86 s** — a 66 % reduction on the path the pre-commit
hook takes on every commit. Whole `check` pipeline: baseline 13.62 s user → now 9.40 s user.

### A1.3 measured: narrowing `explicit-function-return-type`

```
{"allowExpressions":true}                                                    -> 5 hits
{"allowExpressions":true,"allowIIFEs":true}                                  -> 5 hits
{"allowExpressions":true,"allowIIFEs":true,"allowFunctionsWithoutTypeParameters":true} -> 1 hits
```

Bare, the rule produced 30 hits. `allowExpressions` leaves 5, all exported functions with inferred return
types; all five were annotated. `allowFunctionsWithoutTypeParameters` was rejected — it would hide four of
the five real ones.

### A2.5 (blocker) — the compiled binary, before and after

Before, against the **baseline** binary built from commit `ecd4aa5`:

```
$ export HO_HOME="$(mktemp -d)"; /tmp/ho-baseline daemon
ho: Can't find meta/_journal.json file
```

The same code run from source was fine, which is why Phase 1 missed it:

```
$ bun run apps/cli/src/main.ts daemon
health: {"ok":true}
```

After the fix, the compiled binary:

```
$ bun build --compile apps/cli/src/main.ts --outfile /tmp/ho-w1
  [62ms] compile  /tmp/ho-w1
$ /tmp/ho-w1 daemon & curl -fsS http://127.0.0.1:47800/health
{"ok":true}
daemon.json mode: 600
$ /tmp/ho-w1 project add "W1 Check" --path "$PWD"   → project added
$ /tmp/ho-w1 agent list
01a082b5-18ce-7ac2-8105-3ecfa74947dc  Andrew  boss  claude-code/opus@high (subscription)  skills=boss  floor=W1 Check
```

Migration bookkeeping is byte-identical, so **no existing database re-migrates**:

```
DB migrated from the on-disk folder (baseline, created before Wave 1):
[{"hash":"38f97c4147cf252b2d86f2fec1b19543a25c1578f19e60aa6eb703fe7686d52f","created_at":1788653253561}]
DB migrated from the embedded copy (just now):
 {"hash":"38f97c4147cf252b2d86f2fec1b19543a25c1578f19e60aa6eb703fe7686d52f","created_at":1788653253561}
```

Import attributes were verified to survive `--compile` before relying on them:

```
$ bun build --compile t.ts --outfile ./t-bin && ./t-bin
text import works, length: 24 "CREATE TABLE x (a int);\n"
```

### Builds

```
$ bun run ui:build
ui: 3 files, 1100 KiB → .../packages/ui/dist
$ bun run assets:manifest
assets/dist/manifest.json: 43 sprites, 250 frames
$ bun build --compile apps/cli/src/main.ts --outfile /tmp/ho-w1              [62ms] compile
$ bun build --compile --minify --target=bun-linux-arm64-musl packages/runner/src/main.ts   [86ms] compile
```

### `bun audit`

```
bun audit v1.4.2 (744846f84)
No vulnerabilities found (checked 367 packages) [508.00ms]
```

### The office still renders

Instrumented through the dev bundle per the procedure at the top of this file:

```
{"floors":1,"actors":["receptionist","boss"],"layoutIssues":[],"ticking":true,
 "spriteSets":["agent-a","agent-b","agent-c","boss","postman"]}
```

Screenshot captured: floor tiles, walls, desks, plants, elevator, spa, Andrew at his desk, Lola at the
reception — identical to the baseline.

**Procedure note for later waves:** on this machine the 10.3 MB development bundle plus 251 sprite requests
needs **40–50 s** in the hidden Browser pane before `window.__ho` is defined. Reading it at 20 s returns
"no handle" and means nothing. Also: run only **one** daemon — two listeners on 47800 make `daemon.json`
name one process while the socket answers from the other, which shows up as `rejected rpc connection`.

### Docker image build

Still deferred to the Wave 5 record. Note that Wave 1 changed `packages/protocol/src/**`, which feeds
`contextHash`, so `ho doctor` now correctly reports both images as `present, STALE` — the content-hash
mechanism working as designed (observed in the setup checklist: "out of date: ho/agent:dev, ho/git-bridge:dev").
