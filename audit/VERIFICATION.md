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
