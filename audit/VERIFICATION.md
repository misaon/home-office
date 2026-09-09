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

## Wave 2 — hygiene (2026-09-08)

Every block below is copied from the terminal, not retyped.

### `bun install --frozen-lockfile`

```
bun install v1.4.2 (744846f84)
Checked 236 installs across 388 packages (no changes) [13.00ms]
```

### `bun run check`

```
$ bun run typecheck && bun run lint && bun run fmt:check && bun run knip
$ bun run scripts/typecheck.ts
✔ apps/cli/tsconfig.json … ✔ tsconfig.json          (16 projects, all green)
$ oxlint --type-aware --deny-warnings
$ oxfmt --check
Checking formatting...
All matched files use the correct format.
Finished in 319ms on 309 files using 12 threads.
$ knip
bun run check 2>&1  9.46s user 2.22s system 507% cpu 2.301 total
```

### No escapes anywhere

```
$ git ls-files '*.ts' '*.tsx' | xargs grep -n ': any\|<any>\|@ts-ignore\|@ts-expect-error\|@ts-nocheck\|eslint-disable'
none
```

### Vulnerability audits

```
$ bun audit
No vulnerabilities found (checked 367 packages) [320.00ms]

$ for d in images/agent/mcp images/agent/providers/*; do npm ls --prefix "$d" --package-lock-only >/dev/null && npm audit --omit=dev --prefix "$d"; done
-- images/agent/mcp                 found 0 vulnerabilities
-- images/agent/providers/codex      found 0 vulnerabilities
-- images/agent/providers/gemini-cli found 0 vulnerabilities
-- images/agent/providers/opencode   found 0 vulnerabilities
```

The drift guard added in Wave 1 was wrong and is fixed here (A2.3). Proof in both directions:

```
$ npm ls --prefix images/agent/mcp >/dev/null 2>&1; echo $?
1                        # no node_modules there, and nothing installs them in CI either
$ python3 - <<'PY' … adds "left-pad": "^1.3.0" to images/agent/mcp/package.json … PY
$ npm ls --prefix images/agent/mcp --package-lock-only >/dev/null 2>&1; echo $?
1                        # drift detected
$ (revert package.json)
$ npm ls --prefix images/agent/mcp --package-lock-only >/dev/null 2>&1; echo $?
0
```

### Builds

```
$ bun run ui:build
ui: 3 files, 1099 KiB → /Users/.../packages/ui/dist
$ bun run assets:manifest
  furniture/string-lights 20 × 1 cells = 480 × 24 px ×1 … (43 sprites)
$ bun build --compile apps/cli/src/main.ts --outfile <scratch>/ho
  [28ms]  bundle  552 modules
  [66ms] compile  <scratch>/ho
$ bun build --compile --minify --target=bun-linux-arm64-musl packages/runner/src/main.ts --outfile <scratch>/ho-runner
   [5ms]  minify  -0.84 MB (estimate)
   [2ms]  bundle  124 modules
  [74ms] compile  <scratch>/ho-runner bun-linux-aarch64-musl-v1.4.2
```

### Docker images — the item deferred from Wave 1

```
$ docker version --format '{{.Server.Version}}'
29.7.2
$ docker buildx build --load -t ho/git-bridge:audit-w2 images/git-bridge
#7 naming to docker.io/ho/git-bridge:audit-w2 done
#7 unpacking to docker.io/ho/git-bridge:audit-w2 0.1s done
#7 DONE 0.1s
$ ho image build              (through the daemon: context assembly + runner compile + buildx)
ensuring ho/agent:dev (c295feaca199dec4288d155ce4280183)
…
images ready
$ docker images | grep '^ho/'
ho/agent:dev            1.8GB
ho/agent-opencode:dev   2GB
ho/agent-codex:dev      1.89GB
ho/agent-gemini-cli:dev 1.58GB
ho/git-bridge:dev       41.4MB
```

The runner extracted into `@ho/runner/pump` (B14.4) is compiled into the image by that build, and the
binary in the image runs:

```
$ docker run --rm --entrypoint /usr/local/bin/ho-runner ho/agent:dev
HO_GATEWAY and HO_SESSION_TOKEN are required
```

### The compiled binary starts the daemon (A2.5 still fixed), and A2.6 found

```
$ <scratch>/ho daemon
{"level":30,…,"events":0,"lastSeq":-1,"msg":"read model rebuilt"}
{"level":30,…,"host":"127.0.0.1","port":47800,"msg":"rpc server listening"}
{"level":30,…,"resources":"/","msg":"daemon started"}
daemon 0.0.0-dev listening on 127.0.0.1:47800 (pid 22817)
$ curl -fsS http://127.0.0.1:47800/health   →  {"ok":true}
$ stat -f '%Lp' "$HO_HOME/daemon.json"      →  600
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:47800/   →  404
$ <scratch>/ho doctor
ho: Internal server error
{"level":50,…,"err":"ENOENT: no such file or directory, open '/images/agent'","msg":"rpc call failed"}
```

That last log line exists only because of B29.5, fixed in this wave; the 404 and the 500 are the new
finding **A2.6**, scheduled for Wave 5.

### The CLI, run for real (source daemon, `resources` = the repository)

```
$ ho project add "Audit Repo" --path <repo>        → floor 1
$ ho agent add Pam --role worker --provider opencode
  {'provider': 'opencode', 'auth': 'api-key', 'model': 'anthropic/claude-sonnet-5', 'effort': 'medium'}   # B14.3: was "low"
$ ho agent add Jim --role worker --provider claude-code --effort high
  {'provider': 'claude-code', 'model': 'sonnet', 'effort': 'high'}                                        # explicit flag still wins
$ ho project add "Second Floor" --path <tmp>/repo2 --import Pam --import Jim                              # B15.3: repeats collected
$ ho agent list
  … Andrew boss … floor=Audit Repo
  … Pam worker opencode/anthropic/claude-sonnet-5@medium … floor=Audit Repo
  … Jim worker claude-code/sonnet@high … floor=Audit Repo
  … Andrew, Pam, Jim … floor=Second Floor                                                                  # both imports landed
$ ho agent set Pam --project "Audit Repo" --model anthropic/claude-opus-5 --effort low
  {'model': 'anthropic/claude-opus-5', 'effort': 'low', 'auth': 'api-key', 'skillPack': 'worker',
   'appearance': {'spriteSet': 'agent-a', 'gender': 'neutral'}}                                            # B15.1: partial patch, nothing erased
$ ho task create --project "Audit Repo" --title "Verify wave 2" --brief "check the office" --priority high
  {'status': 'inbox', 'priority': 'high', 'assigneeId': None, 'source': {'kind': 'manual'}}
$ ho task list --project "Audit Repo" --status inbox   → the task
$ ho usage                                             → window: all time  sessions: 0  rate-limit incidents: 0
$ ho tail --after 0                                    → 10 stored events replayed, seq 1…10
```

### One version everywhere (B13.5)

```
$ HO_RELEASE_VERSION=1.4.0 ho daemon
daemon 1.4.0 listening on 127.0.0.1:47800 (pid 31068)
$ python3 -c "…json.load(open(daemon.json))['version']"   → 1.4.0
$ ho health                                               → "version": "1.4.0"
```

### The office renders — with no console hacks this time

The Browser pane always reports `document.hidden === true`, which is what exposed B6.1 and B6.6. After
those fixes, a plain reload is enough:

```
> ({hidden: document.hidden, ticking: __ho.scene.app.ticker.started,
   projects: __ho.store.getState().snapshot.projects.size,
   innerKids: __ho.scene.app.stage.children.map(c => c.children.length),
   floorViewChildren: …, worldActors: __ho.bridge.world.actors.size, error: …})
{"hidden": true, "ticking": false, "projects": 2, "innerKids": [1],
 "floorViewChildren": 2, "worldActors": 8, "error": null}
```

Screenshot captured: both floor tabs, the plan with rooms, desks, kitchen, spa and elevator, six agents at
their desks, the chat panel with Andrew. `ticking: false` in that same reading is the point — the office is
correct **and** idle while hidden.

Two measurements behind the fixes:

```
> await new Promise(r => { setTimeout(() => r("no rAF"), 1500); requestAnimationFrame(() => r("rAF fired")); })
"no rAF"                     # browser pane, and a background Chrome window too
> probe after one store change while hidden: {"storeChanges": 1, "updates": 1}, stage 0 → 1 child
```

### The ACP spike (B14.4)

```
$ bun run spikes/s6-acp-mock/src/run.ts
CHECKS {"init":true,"permission":true,"toolCall":true,"toolResultOk":true,"result":true,"exitCode":0}
```

**Procedure notes for later waves.** The Browser pane strips the URL fragment, so `ho ui --print`'s token
never arrives: read it from `daemon.json` and put it in **sessionStorage** under `ho.token` (not
localStorage — `packages/ui/src/rpc.ts` uses sessionStorage), then reload. A real Chrome window driven
through the extension is no better for visibility: an occluded window also reports `document.hidden`.

## Wave 3 — architecture (2026-09-09)

### `bun install --frozen-lockfile`, `bun run check`, escapes, audits

```
$ bun install --frozen-lockfile
Checked 230 installs across 382 packages (no changes) [6.00ms]     # 5 packages fewer: proper-lockfile is gone

$ bun run check
✔ (16 projects) · oxlint --type-aware --deny-warnings · oxfmt --check (312 files) · knip
bun run check 2>&1  9.54s user 2.22s system 589% cpu 1.994 total

$ git ls-files '*.ts' '*.tsx' | xargs grep -n ': any\|<any>\|@ts-ignore\|@ts-expect-error\|@ts-nocheck\|eslint-disable'
none

$ bun audit                        → No vulnerabilities found (checked 361 packages)
$ npm ls --package-lock-only + npm audit --omit=dev (4 sandbox dirs) → 0 vulnerabilities each
```

### Builds and the spike

```
$ bun run ui:build          → ui: 3 files, 1107 KiB
$ bun run assets:manifest   → 43 sprites
$ bun build --compile apps/cli/src/main.ts        → 542 modules, compiled
$ bun build --compile --minify --target=bun-linux-arm64-musl packages/runner/src/main.ts → 124 modules, compiled
$ bun run spikes/s6-acp-mock/src/run.ts
CHECKS {"init":true,"permission":true,"toolCall":true,"toolResultOk":true,"result":true,"exitCode":0}
```

### The projection indexes, checked against brute-force scans (B4.1)

A probe drove real commands through `Office.execute` — project, two agents, a task,
assign, session start → running → idle (rate limited) → usage → end, a transition back to
`assigned`, a second session, mail received and acknowledged, an agent removed — then compared every index
with a scan of the same maps:

```
ok   agentsByProject 6ff1f7      ok   tasksByProject 6ff1f7
ok   sessionsByTask cd798e       ok   sessionsByTask bf0d3d
ok   sessionsByAgent 1565d7      ok   sessionsByAgent 5be463
ok   activeSessions              ok   mailBySource
ok   removed agent left no index entry
ok   rate limits counted         ok   second session is the only active one
entities: 1 projects, 2 agents, 2 tasks, 2 sessions, 1 mail; lastSeq 20
every index matches a brute-force scan
```

### The single-instance lock (B16.3)

```
first holder: acquired
second while held: refused (correct)
holder file: {"pid":<pid>,"at":1788904563769}
after release: acquired (correct)
stale (dead pid) takeover: acquired (correct)
fresh corrupt holder: refused (correct: younger than the stale window)
```

and against the real CLI:

```
$ ho daemon           (first)   → {"ok":true}
$ ho daemon           (second)  → ho: another daemon already holds <home>
$ pkill -TERM …                 → the lock directory is gone
$ ho daemon           (restart) → {"ok":true}
$ kill -9 <pid>; ho daemon      → {"ok":true}    # stale lock taken over
```

### One MCP server per session, not per call (B4.3)

Verified against the installed SDK 1.30.0 (`Protocol.connect` throws when a transport is attached;
`_onclose` clears it) and then by driving three `initialize` round-trips through one cached server:

```
round 1: 200 {"result":{"protocolVersion":"2025-06-18",…
round 2: 200 …
round 3: 200 …
three sequential transports on one cached McpServer: ok
```

### The whole product, run for real

Two Claude Code sessions actually ran in sandboxes on this machine against the changed core:

```
$ ho project add "Wave 3" --path <repo>      → floor 1
$ ho agent add Kelly --role reviewer         → claude-code/sonnet@medium
$ ho task create … ; ho task assign … Kelly  → assigned
$ ho task move <id> blocked --reason probe    → blocked
$ ho chat "hello from wave 3" --project "Wave 3"
$ ho session list
01a0830f-d38f…  stopped  task=ced7a451 agent=3eb25bac turns=17  34in/4220out/528624cache
01a0830f-d444…  stopped  task=cf3ce09b agent=06e3cc2f turns=4    8in/453out/51130cache
$ ho usage
window: all time  sessions: 2  rate-limit incidents: 0
TOTAL  in=42  out=4,673  cache=579,754  write=55,582  turns=21
-- by agent   Kelly … sessions=1     Andrew … sessions=1
$ ho task list --project "Wave 3"
… blocked  normal  index check      → Kelly
… done     normal  hello from wave 3 → Andrew
$ ho doctor
docker: ok 29.7.2 (api 1.55, linux/arm64) · images present · sessions: 2 active / 2 max
$ grep '"msg"' daemon.log | sort | uniq -c
2 scheduling session · 2 runner connected · 1 read model rebuilt · 1 daemon started   (0 errors, 0 "rpc call failed")
```

The office rendered with that data — screenshot captured: both the plan and the chat panel, which shows the
boss's own reply ("Hello! Andrew here, Wave 3 floor. Team right now: Kelly (reviewer)…") and the two status
lines the deduplicated `statusLine` produced ("Kelly is working on 'index check'", "'index check' is
blocked: probe"). Store reading, in the always-hidden pane, after a plain reload:

```
{"connection":"online","replayed":true,"projects":1,"agents":2,"tasks":2,
 "chatFloors":1,"chatMessages":[4],"innerKids":[1],"worldActors":3,"ticking":false,"error":null}
```

`chatFloors: 1, chatMessages: [4]` is the bounded per-floor chat (B4.2) seen from the UI.

### Docker images, and the two findings that came out of building them

```
$ docker buildx build --load -t ho/git-bridge:audit-w3 images/git-bridge   → DONE
$ ho image build                                                          → images ready
$ ho doctor → image ho/agent:dev: present, up to date · image ho/git-bridge:dev: present, up to date
```

The first `ho image build` of this wave failed on a transient fetch from `downloads.claude.ai` inside the
`claude-code` apk step; a retry succeeded, and running the same step standalone on `alpine:3.24.1` installs
`claude-code=2.1.263-r1` cleanly (the pinned version is still in the repository — 120 versions are). Chasing
that failure is what uncovered **B24.3** (the content hash matched no context files) and **B5.5** (a failed
build reached the CLI as "Internal server error"), both fixed and verified in this wave:

```
$ (append `RUN false` to images/git-bridge/Dockerfile)
$ ho image build
 12 | >>> RUN echo "deliberate audit failure" >&2 && false
ERROR: failed to build: failed to solve: process "/bin/sh -c echo …" did not complete successfully: exit code: 1
ho: image build failed (1): #0 building with "default" instance using docker driver
$ echo $?
1
$ (restore the Dockerfile) ; ho image build → images ready ; ho doctor → up to date
```

## Wave 4 — runtime and protocols (2026-09-09)

### Checks, audits, builds

```
$ bun install --frozen-lockfile   → Checked 230 installs across 382 packages (no changes)
$ bun run check                   → 16 projects · oxlint --type-aware · oxfmt (312 files) · knip
                                    9.45s user 2.11s system 556% cpu 2.078 total
$ (escapes grep)                  → none
$ bun audit                       → No vulnerabilities found (checked 361 packages)
$ npm ls --package-lock-only + npm audit (4 sandbox dirs) → 0 vulnerabilities each
$ bun run ui:build                → ui: 3 files, 1110 KiB
$ bun build --compile apps/cli/src/main.ts            → compiled
$ bun build --compile --minify --target=bun-linux-arm64-musl packages/runner/src/main.ts → compiled
$ bun run spikes/s6-acp-mock/src/run.ts
CHECKS {"init":true,"permission":true,"toolCall":true,"toolResultOk":true,"result":true,"exitCode":0}
```

### The occupancy index, measured in isolation (B18.1)

The whole-tick timings were useless for this: a different occupancy view changes pathing
decisions, so the two versions do different amounts of work. Measured instead with one query per walker
per frame over 900 frames, both implementations in the same process on the same data:

```
 8 walkers   legacy 0.0019 ms/frame   indexed 0.0007 ms/frame   (2.7x)
30 walkers   legacy 0.0166 ms/frame   indexed 0.0017 ms/frame   (9.8x)
60 walkers   legacy 0.0536 ms/frame   indexed 0.0033 ms/frame   (16x)
```

The shape is the point: the legacy cost grows with N² (one Set of every actor built per query), the
indexed one with N (one index per tick, read O(1) per query).

### The ACP usage mapping (B30.1)

The spike's mock agent never sends `usage_update`, so the mapper was driven directly:

```
sdk PROTOCOL_VERSION: 1
usage_update with cost:    [{"kind":"context","usedTokens":12345,"windowTokens":200000,
                             "cost":{"amount":0.42,"currency":"USD"}}]
usage_update without cost: [{"kind":"context","usedTokens":1,"windowTokens":2,"cost":null}]
agent_thought_chunk:       []
```

`PROTOCOL_VERSION` now comes from the SDK (the value it exports is 1, which is what the local constant
said). A live ACP session with a real provider was **not** run in this session — that needs OpenCode,
Gemini CLI or Codex credentials — so the end-to-end path is verified only as far as the mapper.

### Per-collection snapshots, verified in the live UI (B6.2)

Reference identity read from the running app through the dev handle, before and after a task-only event:

```
> before = __ho.store.getState().snapshot
$ ho task create --project "Wave 4" --title "slice probe" --brief b
> after = __ho.store.getState().snapshot
{"snapshotObjectChanged": true, "tasksCopied": true,
 "projectsReused": true, "agentsReused": true, "sessionsReused": true,
 "chatReused": true, "mailReused": true, "taskCount": 1}
```

Only `tasks` was copied; every other collection kept its identity, so the panels selecting them do not
re-render.

### The whole product again, with a real agent session

```
$ ho project add "Wave 4" --path <repo>      → floor
$ ho agent add Ryan --role worker            → claude-code/sonnet@medium
$ ho image build                             → images ready   (git-bridge hash 1ea8e546…, the fixed hash)
$ ho task assign <task> Ryan                 → assigned
   daemon.log: "scheduling session" appears immediately (0 s) — the 2 s heartbeat is gone (B10.1)
$ ho session list
01a08328-ac05…  stopped  task=15a06d9e agent=d2770b13 turns=6  12in/1200out/168526cache
$ ho usage        → sessions: 1 · in=12 out=1,200 cache=168,526 write=13,235 turns=6
$ grep '"msg"' daemon.log | sort | uniq -c
   1 scheduling session · 1 runner connected · 1 read model rebuilt · 1 daemon started   (no errors)
```

The office rendered it: screenshot with the floor plan and the chat panel showing the boss's status line
("Ryan is working on 'slice probe'") and the agent's question that moved the task to `blocked`. Live events
seen by the UI for that session: `init, tool_call, tool_result, text_delta, usage, result` (19 events).

## Wave 5 — infrastructure (2026-09-09)

### Checks, audits, builds

```
$ bun install --frozen-lockfile   → Checked 230 installs across 382 packages (no changes)
$ bun run check                   → typecheck · lint · fmt · knip · ui:build (now part of the gate, B19.1)
                                    10.00s user 2.79s system 569% cpu 2.248 total
$ (escapes grep)                  → none
$ bun audit                       → No vulnerabilities found (checked 361 packages)
$ npm ls --package-lock-only + npm audit (4 sandbox dirs) → 0 vulnerabilities each
$ bun run assets:manifest         → 43 sprites
$ bun build --compile apps/cli/src/main.ts   → compiled
$ bun build --target=bun --minify packages/runner/src/main.ts → bundled
$ bun run spikes/s6-acp-mock/src/run.ts
CHECKS {"init":true,"permission":true,"toolCall":true,"toolResultOk":true,"result":true,"exitCode":0}
```

### Security (B20.1–B20.3)

A state directory deliberately created world-readable, then a daemon started in it:

```
$ ls -ld <home>            (before)  drwxr-xr-x
$ ls -ld <home>            (after)   drwx------
$ ls -l <home>
-rw-------  daemon.json     drwx------  daemon.lock
-rw-------  ho.db           -rw-------  ho.db-shm     -rw-------  ho.db-wal      # were -rw-r--r--
$ ho health                          → {"ok":true, …}
$ curl -H 'Authorization: Bearer wrong' …/rpc → 401
```

`Bun.timingSafeEqual` does not exist in Bun 1.4.2 (`typeof` → `undefined`), which is what AUDIT.md's B20.1
recommended; `node:crypto`'s does and is what shipped.

### A compiled binary now says what it cannot do (A2.6), and never hangs on a secret (A2.7)

```
$ <compiled ho> daemon ; curl …/health            → {"ok":true}
$ curl …/                                         → this build carries no office UI bundle; use the desktop
                                                    app or run the daemon from a source checkout
$ <compiled ho> ui --print                        → ho: this daemon serves no office UI (the build carries
                                                    no bundle); use the desktop app or run the daemon from
                                                    a source checkout
$ <compiled ho> image build                       → ho: this build carries no image build contexts; build
                                                    the images from a source checkout or the desktop app
$ cat <home>/daemon.json | jq .serves             → {"ui": false, "images": false}
$ <compiled ho> doctor                            → ho: the system secret store did not answer in 5 s; on
                                                    macOS a build it has not seen before waits for a
                                                    Keychain access prompt (approve it, or use a
                                                    file-backed secret store)      [6 s, exit non-zero]
   daemon.log: {"level":50,…,"err":"the system secret store did not answer in 5 s; …"}
```

and from source nothing changed:

```
$ daemon.json .serves → {"ui": true, "images": true}
$ curl …/ → 200 · ho doctor → both images listed · ho ui --print → the tokened URL
```

The Keychain measurement behind A2.7, same item, same machine:

```
$ bun run <probe>.ts                                   → present=true in 30 ms
$ bun build --compile <probe>.ts && ./keyprobe          → no output, still running after 15 s (killed)
```

### The runner on the image's own Bun (B21.2)

```
$ bun build --compile --minify --target=bun-linux-arm64-musl … → 74,517,712 bytes
$ bun build --target=bun --minify …                            →    117,730 bytes   (633× smaller)
$ ho image build ; docker images | grep '^ho/agent:dev'        → 1.69GB   (was 1.76GB)
$ docker run --rm ho/agent:dev                                 → HO_GATEWAY and HO_SESSION_TOKEN are required
$ (real session) daemon.log                                    → "runner connected", 1 turn, stopped cleanly
```

### Desktop strictness, measured flag by flag (A1.6)

```
exactOptionalPropertyTypes          15 errors, 0 in apps/desktop/src
noPropertyAccessFromIndexSignature   0 errors      → re-enabled
noUncheckedIndexedAccess             0 errors      → re-enabled
noImplicitReturns                    1 error,  0 in apps/desktop/src
```

Keeping the devkit out of the strict program was attempted and fails:
`error TS4094: Property 'partitionId' of exported anonymous class type may not be private or protected`.

### AI configuration (B33.1–B33.6), re-read today and then run

Documentation re-fetched 2026-09-09 (`settings-reference.md`, `env-vars.md`, `cli-reference.md`), quoting
the parts that decided each change: "Use `attribution` instead, which replaces this key … but ignores it
once you set `attribution.commit` or `attribution.pr`"; "To hide all attribution today, set
`attribution.commit` and `attribution.pr` to empty strings and `attribution.sessionUrl` to `false`";
`includeGitInstructions` default `true`, `false` "leaves both out"; `bashOutputMaxChars` "clamps the value
into the range 4000 to 128000" and "when you set this key, Claude Code ignores the
`BASH_MAX_OUTPUT_LENGTH` environment variable"; `--model` takes "`sonnet`, `opus`, `haiku`, or `fable`".

Defaults, verified against a running daemon:

```
boss      opus    medium      (was high)
worker    sonnet  high        (was medium)
reviewer  sonnet  high
clerk     haiku   low         (was sonnet medium — the role→model map used to live only in the UI)
codex worker      high        (its catalogue offers low…xhigh)
opencode worker   medium      (declares no effort levels; existing fallback)
```

And a real Claude Code session with the new settings ran to completion — 4 turns, task `done`, one report
note, no settings warnings anywhere in the daemon log or the agent's stderr:

```
$ ho task assign <task> Angela
01a08347-8056…  stopped  task=215e0777 agent=99c7ad91 turns=4  8in/643out/78632cache
status: done   notes: ['report']
```

### Images after the wave

```
$ ho image build → images ready
$ ho doctor      → image ho/agent:dev: present, up to date · image ho/git-bridge:dev: present, up to date
$ docker images  → ho/agent:dev 1.69GB · ho/git-bridge:dev 41.4MB
```

## Wave 6 — DX and UI (2026-09-09)

### Checks, audits, builds

```
$ bun install --frozen-lockfile   → Checked 231 installs across 383 packages (no changes) [9.00ms]
$ bun run typecheck               → 16/16 tsconfig projects ✔ (TypeScript 7 native tsc)
$ bun run lint                    → oxlint --type-aware --deny-warnings, no output, exit 0
$ bun run fmt:check               → All matched files use the correct format (317 files)
$ bun run knip                    → no output, exit 0
$ (suppression sweep)             → the same two recorded in SUPPRESSIONS.md, no new ones
$ bun audit                       → No vulnerabilities found (checked 362 packages)
$ npm ls --package-lock-only + npm audit  (mcp, codex, gemini-cli, opencode) → found 0 vulnerabilities ×4
$ bun run ui:build                → ui: 3 files, 1111 KiB
$ bun run assets:manifest         → 43 sprites
$ bun build --compile apps/cli/src/main.ts → 549 modules, 63 729 522 B binary
$ bun build --target=bun --minify packages/runner/src/main.ts → 125 modules, ho-runner.js 118.62 KB
$ bun run desktop:prepare         → resources ready at apps/desktop/resources/ho
$ bun run spikes/s6-acp-mock/src/run.ts
CHECKS {"init":true,"permission":true,"toolCall":true,"toolResultOk":true,"result":true,"exitCode":0}
```

### The CLI is one table now (B5.1, B5.2, B5.3, B5.6)

```
$ ho help                → 17 commands, generated by walking COMMANDS
$ ho nope                → ho: unknown command "nope"  + the same help
$ ho project             → ho: missing project subcommand  + only that command's usage
$ ho health              → daemon 0.0.0-dev up 326 s since 2026-09-08T23:31:47.283Z
$ ho health --json       → {"ok":true,"version":"0.0.0-dev","startedAt":"…","uptimeMs":325870}
$ ho doctor              → docker: ok 29.7.2 (api 1.55, linux/arm64)
                           image ho/agent:dev: present, up to date
                           image ho/git-bridge:dev: present, up to date
                           secret anthropic-oauth-token: present
                           sessions: 0 active / 2 max
                           resources: 0 containers, 10 volumes (1.2 GiB), images 3.9 GiB
$ ho doctor --json       → the whole report as the daemon returned it
$ ho resources --json    → {"snapshot":{"containers":0,"volumes":10,"imagesBytes":4209751324,…
```

`ho doctor`, `ho resources` and the Resources panel now print the same units from one `formatBytes`
(`1.2 GiB`, base 1024) instead of GB/1024, MB/1024 and MB/1000.

Bad arguments used to print the JSON issue array a Zod 4 `ZodError` carries as its `message`, and an oRPC
input rejection printed only "Input validation failed". Both now render from their issues:

```
before  $ ho secret set bogus         → ho: [ { "code": "invalid_value", "values": [ … ] } ]   (14 lines)
after   $ ho secret set bogus         → ho: Invalid option: expected one of "anthropic-oauth-token"|…
before  $ ho task list --status nope  → 20 lines of the same shape
after   $ ho task list --status nope  → ho: Invalid option: expected one of "inbox"|"planned"|… → at [0]
before  $ ho project inspect --url http://…  → ho: Input validation failed
after   $ ho project inspect --url http://…  → ho: repo.url: use an HTTPS or SSH repository URL without
                                               embedded credentials
```

### B5.4 is withdrawn: Bun restores the terminal, measured

A pty harness (`pty.openpty()`, the slave fd held open by the parent the way a shell holds its tty —
closing it lets the pty reset its own line discipline and hides the effect):

```
control, plain sh:  echo before True → at prompt False → after SIGINT False   (a real leak)
bun, $`stty -echo`, console read:    → at prompt False → after SIGINT True    (exit -2, no handler)
bun, Bun.spawnSync(["stty","-echo"]) → at prompt False → after SIGINT True
bun, same, normal exit               → echo after normal exit True            (exit 0)
pty with ECHO off before bun starts  → echo after bun exits False             (restores, not forces)
```

`src/jsc/bindings/c-bindings.cpp` in Bun's tree: `tcgetattr` into `termios_to_restore_later[fd]` at `:752`,
`bun_restore_stdio()` at `:598` (`tcsetattr` `:634`) called from `atexit`/`__cxa_atexit` (`:819-825`) and
from `onExitSignal` installed with `sigaction(SIGINT, …)` (`:642`, `:776`); the comment at `:610` reads
"keep the unconditional restore so the shell prompt comes back cooked." The `SIGINT` handler I had written
for this finding was removed before it was committed, and `@clack/prompts` is not adopted.

### B6.3: the `chunk` naming is load-bearing, and splitting buys nothing

```
naming without `chunk`  → chunk-n3g8fk3m.js + chunk-t701s5y1.css   (Bun's default chunk pattern)
naming with `chunk`     → index-nt40nc7v.js + index-6rnc86sq.css   (what the HTML references)
pixi.js alone, minified, browser target      → 509 679 B
react + react-dom + @tanstack/react-query    → 207 517 B
the whole bundle                             → 1 113 127 B
served page, browser pane: responseEnd 6 ms · script fetched in 5 ms · domContentLoaded 73 ms ·
                           loadEventEnd 74 ms · then ~230 sprite PNGs
```

### B6.5: one repository-URL rule for both clients

```
$ ho project inspect --url git@github.com:oven-sh/bun.git   → git repository bun on main   (was: rejected)
$ ho project inspect --url https://github.com/oven-sh/bun.git → git repository bun on main
$ ho project inspect --url http://github.com/oven-sh/bun.git  → ho: repo.url: use an HTTPS or SSH …
office UI, Add a project: field hint "a directory on this machine, or https://host/org/repo,
ssh://git@host/org/repo or git@host:org/repo"; typing git@github.com:oven-sh/bun.git →
"git repository · default branch main", name "bun", branch "main"; typing http://… →
"repo.url: use an HTTPS or SSH repository URL without embedded credentials"
```

### B6.7: a rejected token stops the reconnect loop

```
$ grep -c "rejected rpc connection" daemon.log   → 484   (a tab left open across a daemon restart)
sessionStorage ho.token = stale, page reloaded   → 485   (one attempt)
+25 s with the page open                         → 485   (delta 0)
the page itself                                  → "No daemon token. Open the office with `ho ui`."
location.hash = "#token=<current>"  (no reload)  → "Connected", floor Wave 6, chat restored
```

### B13.1: provider state volumes are no longer called "claude"

```
$ docker volume ls --filter label=ho.managed=true
ho-task-2ebb6e9bc730                  provider-state → ho-task-2ebb6e9bc730-state-6538c3f8
ho-task-6447ced7a451-claude-3eb25bac  claude-config  (from earlier waves, still pruned)
$ docker volume inspect ho-task-2ebb6e9bc730-state-6538c3f8
labels=map[ho.kind:provider-state ho.managed:true ho.project:01a08365-… ho.session:01a08365-…]
$ (the GC's kind list, per kind)  task-volume → 6 · provider-state → 1 · claude-config → 5
```

The prune itself was not run: with the default retention it would collect nothing, and forcing it would
irreversibly delete volumes on the owner's machine. What the fix needed proving is that the label filter
still matches the legacy volumes, which the counts above show.

### B13.2: an OS credential store, chosen by whether it answers

```
macOS host,  auto  → reads through Bun.secrets, no fallback line
Linux, no libsecret (docker run oven/bun:1.4.2-alpine):
    FELL BACK: libsecret not available
    auto get = linux-probe
    secrets.json = { "github-token": "linux-probe" }
config "keychain" → os   ·  config "os" → os  ·  config "file" → file  ·  default → auto
compiled binary, config { "secrets": { "store": "file" } }:
    ho secret set github-token (stdin) → stored · status → present · secrets.json mode 600 · rm → removed
compiled binary, auto, first run: ho doctor → ho: the system secret store did not answer in 5 s; on macOS
    a build it has not seen before waits for a Keychain access prompt (approve it, or use a file-backed
    secret store)                                        # A2.7's bound, and no silent downgrade
```

### B13.3: one ACP prompt is one turn

The mock agent temporarily emitting three tool calls in a single prompt, driven through the same
`RunnerChannel` the daemon uses:

```
audited baseline → result ok=true turns=3 session=mock-… (turns = tool calls)
after the fix    → result ok=true turns=1 session=mock-… (turns = ACP prompt turns)
CHECKS {"init":true,"permission":true,"toolCall":true,"toolResultOk":true,"result":true,"exitCode":0}
```

### B21.4: the daemon's log file is bounded

```
after writing 14 938 890 B through createLogger(level, file):
t+10s … t+50s  live=14938890 bytes  rotated=(absent)
t+60s          live=0 bytes         rotated=14938890 bytes      # the once-a-minute check
then one more log line              live=92 bytes
last line: {"level":40,"time":…,"app":"ho","stage":"after","msg":"written after rotation"}
```

### The whole product again, with a real agent session

```
$ ho project add "Wave 6" --path <probe repo>  → added floor Wave 6 01a08365-0fd1-… on main
$ ho agent add Toby --role worker              → hired Toby (worker) on Wave 6: claude-code/sonnet@high
$ ho task create --project 1 --title "describe greet.js" --brief "…"
$ ho task assign <task> Toby                   → assigned
$ ho session list
01a08365-3a97-714d-9347-bdd4277608d0  stopped  task=6e9bc730 agent=6538c3f8 turns=5 10in/503out/120861cache
$ ho task show <task>                          → status "done", a report note from Toby
$ ho usage                                     → 1 session · in=10 out=503 cache=120,861 write=10,614
$ grep '"msg"' daemon.log | sort | uniq -c     → 4 read model rebuilt · 4 rpc server listening ·
                                                 4 daemon started · 3 daemon stopping ·
                                                 1 scheduling session · 1 runner connected · 0 errors
$ ho image build                               → images ready
$ ho doctor                                    → both images present, up to date
```

The office rendered it live: header "Connected", floor tab "Wave 6", and the chat panel showing Andrew's
line "Toby is working on “describe greet.js”." The 393 `rejected rpc connection` lines in that log came
from the stale tab this wave then fixed (B6.7), and are the reason B21.4 was found.

## Wave 7 — documentation (2026-09-09)

### Checks, audits, builds

```
$ bun install --frozen-lockfile   → Checked 231 installs across 383 packages (no changes) [17.00ms]
$ bun run check                   → 16/16 tsconfig ✔ · oxlint clean · oxfmt 317 files · knip clean ·
                                    ui: 3 files, 1111 KiB
$ bun audit                       → No vulnerabilities found (checked 362 packages)
$ npm ls --package-lock-only + npm audit  (mcp, codex, gemini-cli, opencode) → found 0 vulnerabilities ×4
$ ho image build                  → images ready   (the agent image rebuilt: the MCP bump below changed
                                    the content hash, which is B24.3's fix working again)
$ ho doctor                       → both images present, up to date
$ docker run --rm ho/agent:dev    → HO_GATEWAY and HO_SESSION_TOKEN are required
```

### One inaccuracy in the audit's own record

`audit/DEPENDENCIES.md` listed `chrome-devtools-mcp` 1.8.0 → 1.9.0 under "Bumped", and `AUDIT.md`
recommended it — but `images/agent/mcp/package.json` still pinned 1.8.0 and its lockfile agreed. The bump
is now applied for real:

```
$ npm install --prefix images/agent/mcp --package-lock-only  → up to date, audited 5 packages
$ (lockfile)  node_modules/chrome-devtools-mcp 1.9.0 · node_modules/@playwright/mcp 0.0.80
$ npm audit --omit=dev --prefix images/agent/mcp             → found 0 vulnerabilities
$ (registry, read 2026-09-09) chrome-devtools-mcp latest 1.9.0 published 2026-09-08T09:53:29Z
                              @playwright/mcp   latest 0.0.80 published 2026-09-01T03:48:24Z
$ docker run --rm --entrypoint sh ho/agent:dev …
chrome-devtools-mcp 1.9.0 · @playwright/mcp 0.0.80 · rtk 0.48.0 · claude 2.1.263 · claude settings present
```

### Every number the documentation states, re-read in the source

```
live log caps            packages/ui/src/store.ts:70-71   LIVE_LIMIT 300 · LIVE_SESSION_LIMIT 20
chat tail                packages/core/src/model/read-model.ts:63   CHAT_TAIL 500
rate-limit tail          read-model.ts:60                 RATE_LIMIT_TAIL 1000
handshake timeout        packages/core/src/socket.ts:3     HANDSHAKE_TIMEOUT_MS 10_000
hidden-document bump     packages/ui/src/store.ts:158      HIDDEN_BUMP_MS 200
renderer frame cap       packages/ui/src/office/scene.ts:65   ticker.maxFPS = 30
floor view cache         scene.ts:127                     while (#floors.size > 2)  (LRU by re-insert)
claude-code termination  runtime-claude-code/src/runtime.ts:141-159  SIGTERM 5 s · SIGKILL 10 s · give up 15 s
acp termination          runtime-acp/src/runtime.ts:9,60-71   CLOSE_GRACE_MS 5000 ×1 / ×2 / ×3
single-instance lock     daemon/src/single-instance.ts:9   STALE_MS 30_000, atomic mkdir + pid liveness
office gate timeout      daemon/src/office-gate.ts:27      30_000
state directory default  daemon/src/config.ts:69          ~/.config/home-office, HO_HOME overrides
mirror path              daemon/src/mirrors.ts:10          <home>/mirrors/<projectId>.git, mode 0700
task branch              daemon/src/git-bridge.ts:8        ho/task-<taskId>
git-bridge network       daemon/src/git-bridge.ts:24       network: "none"
container hardening      sandbox-docker/src/provider.ts:69-71  CapDrop ALL · no-new-privileges · ReadonlyRootfs
static file safety       daemon/src/static.ts:1,26,36      realpath escape check · nosniff
compiler projects        bun run typecheck                 16
image contents           docker run ho/agent:dev           node v24.18.1 · bun 1.4.2
```

### Documentation changed

`README.md` (the compiled binary's limits, the secret store, a link to this audit rather than the earlier
report), `AGENTS.md` (the audit directory, `bun run check` including the UI build, `packages/runner` in the
layout, tests/comments framed as the owner's per-task decision, and "a number in documentation is a
claim"), `docs/STACK.md` (Knip 6.35.0, `proper-lockfile` replaced by an own single-instance lock,
`type-fest`/`yoctocolors` added, the secret store, the runner bundle and its image saving, the React
Compiler and why there is no `useCallback`, chrome-devtools-mcp 1.9.0, and ADR 004/005 as the source),
`docs/ARCHITECTURE.md` (the runner as a bundle, the single-instance lock, provider-state volumes with the
legacy label still pruned, what `turns` means per provider, ACP context usage, the hidden-document still
frame and the 200 ms bump, the refused-token tab, the bounded secret read, the rotated log, and
`packages/runner` in the package table), `docs/CONVENTIONS.md` (the check list, the eight lint rules that
change how code is written, the secret-store rule, the dependency rule, and "correct the document beside
the original claim"), `docs/PLAN.md` (what this audit implemented, a re-scoped retention and accounting
row, the image-size row, the ADR index, what waits on the owner, and an audit-log entry) and
`docs/OFFICE-ART.md` (A3.3: `assets/README.md` named as the load-bearing contract, with the three files
that implement it).

### Final sweep for leftovers (B28)

```
$ git ls-files | wc -l                                  → 642
$ grep -rn "TODO|FIXME|XXX|HACK" apps packages scripts  → none
$ grep -rn "console.log(|debugger;" apps packages scripts → none
$ empty tracked files                                   → assets/src/.gitkeep (deliberate)
$ git status --porcelain -uall                          → only the files this wave changed
$ bun run knip                                          → clean
```

### CI ran this pull request (A2.1, A2.2) — the last row to close

Everything else in this file was measured on the owner's machine. The workflow itself could only be
verified by GitHub running it, which is what opening the pull request did. Run **34329322345**, both jobs
green, 2026-09-09 08:28:42Z → 08:34:46Z:

```
$ gh pr checks 5
check   pass   40s     https://github.com/misaon/home-office/actions/runs/34329322345/job/102393929173
images  pass   5m58s   https://github.com/misaon/home-office/actions/runs/34329322345/job/102393929489

check job — the daemon smoke step added in Wave 1 (B27.1), the one that caught A2.5:
  {"level":30,…,"events":0,"lastSeq":-1,"msg":"read model rebuilt"}
  {"level":30,…,"host":"127.0.0.1","port":47800,"msg":"rpc server listening"}
  {"ok":true}
  daemon 0.0.0-dev listening on 127.0.0.1:47800 (pid 2942)
  {"level":30,…,"msg":"daemon stopping"}
  (the step is `set -e`, so `test "$(stat -c '%a' "$HO_HOME/daemon.json")" = 600` passing is the assertion)
check job — the sandbox lockfile guard and audits fixed in Wave 2 (A2.3):
  found 0 vulnerabilities   ×4   (mcp, codex, gemini-cli, opencode)

images job — ubuntu-24.04-arm, buildx with the GHA layer cache (A2.1, added in Wave 5):
  git-bridge, then the agent image's `base` and `claude-code` targets
  HO_GATEWAY and HO_SESSION_TOKEN are required      # the entrypoint refusal
  rtk 0.48.0                                        # claude --version && rtk --version && settings.json
  git version 2.54.0                                # ho/git-bridge:ci --version
```

With this, all 42 rows of the coverage matrix read `OVĚŘENO` and none is `N/A`.

## After the audit — B31.5, found by the owner (2026-09-09)

The owner started the daemon against **their own** `~/.config/home-office` for the first time and got a
dead end. Diagnosed on a copy of that database, never on the original:

```
$ (their real message)
ho: Cannot replay the event log; database preserved. Restore or migrate it before starting.

$ (replaying a copy, cause chain printed)
[0] Error: Cannot replay the event log; database preserved. …
[1] ZodError: payload.agent.projectId — Invalid input: expected string, received undefined

$ (every stored event checked against the current schema)
seq   2 agent.created        payload.agent.projectId: expected string, received undefined
seq  14 project.created      payload.project.repo.kind: Invalid discriminator value. Expected 'local' | 'git'
seq  15 chat.message_posted  payload.message.projectId: expected string, received undefined
seq  16 agent.created        payload.agent.projectId: expected string, received undefined
seq  17 chat.message_posted  payload.message.projectId: expected string, received undefined
seq  31 chat.message_posted  payload.message.projectId: expected string, received undefined
44 events, 6 do not parse under the current schema

$ (what the log holds: a 2026-09-06 pre-D23 session)
  1 project "home-office" repo={"kind":"local","path":"…/home-office"}
  2 agent "Pam" role=worker provider=claude-code project=(none)
  3 task "Add CONTRIBUTING.md"
 14 project "Office" repo={"kind":"none"}            # the pre-D23 Lobby
 16 agent "Ondra" role=boss provider=claude-code project=(none)
 18 task "Podívej se na web seznam.cz …"  → done
 24 task "Zjistit hlavní zprávu dne na Seznam.cz …" → done
```

After the fix, the same copy produces a diagnosis instead of a wall:

```
$ HO_HOME=<copy> ho daemon --ui
ho: Cannot replay the event log; <home>/ho.db is preserved and untouched. Restore it from a backup, or —
if the events predate a schema change and are expendable — move ho.db, ho.db-wal and ho.db-shm aside and
start with an empty log.
  caused by: stored event 2 (agent.created, 2026-09-06T08:57:53.477Z) does not match the current schema
  caused by: Invalid input: expected string, received undefined
  → at payload.agent.projectId
```

And a healthy start still works, unchanged:

```
$ HO_HOME=<fresh> ho daemon --ui
{"level":30,…,"events":0,"lastSeq":-1,"msg":"read model rebuilt"}
{"level":30,…,"host":"127.0.0.1","port":47800,"msg":"rpc server listening"}
daemon 0.0.0-dev up 0 s since 2026-09-09T09:48:51.698Z
$ bun run check → typecheck 16/16 · oxlint clean · oxfmt 317 files · knip clean · ui 3 files, 1112 KiB
```

### B6.8, also found by the owner (2026-09-09)

`ho daemon --ui` printed `office UI: http://127.0.0.1:47800/ …`, the owner opened it, and the office said
`No daemon token`. Reproduced and then fixed; all three paths checked in the browser against a real daemon:

```
$ ho daemon --ui       (before)  office UI: http://127.0.0.1:47800/ — the token is in daemon.json (0600); …
$ ho daemon --ui       (after)   office UI: served on 127.0.0.1:47800, but the page needs this launch's
                                 token — run `ho ui` to open it, or `ho ui --print` for the URL. Opening
                                 http://127.0.0.1:47800/ without the token shows an empty office.

sessionStorage empty, open /            → "This page carries no daemon token. Run `ho ui` to open the
                                           office with it."
ho.token = "stale-from-a-previous-launch" → "The daemon refused this page's token — it mints a new one
                                           every launch. Run `ho ui` again to reconnect."   (one attempt)
location.hash = "#token=<current>"       → the office loads, no reload, "Add a project (floor)"
$ bun run check → typecheck 16/16 · oxlint clean · oxfmt · knip · ui 3 files, 1112 KiB
```

## The add-project dialog and the airier UI (2026-09-09)

The owner's task: a native directory picker behind an icon, a separate git-URL input, a branch select
instead of a text field, and an airier UI. Plan and decisions in
[docs/plans/2026-09-09-add-project-and-ui-spacing.md](../docs/plans/2026-09-09-add-project-and-ui-spacing.md).

### What git actually answers, before the code assumed it

```
$ git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin | head -20
audit/deep-monorepo-audit-2026-09
codex/monorepo-audit-2026-09
codex/office-art-base
feat/floors-andrew-lola
feat/office-base-v1
ho/add-contributing-md-04a0d2d4
ho/task-01a0830f-d332-7601-b1e8-6447ced7a451
…
main
origin
origin/audit/deep-monorepo-audit-2026-09
origin/main

$ git ls-remote --symref https://github.com/misaon/home-office.git HEAD 'refs/heads/*'
ref: refs/heads/main	HEAD
29bcf5cb237325e3d6f58a4085834837928f2f8c	HEAD
2c437d2891bc9747b13b5ba2097ebd1a0f82f396	refs/heads/audit/deep-monorepo-audit-2026-09
fa035f9645eb942fcf086b9c7a7ebf567b462ce1	refs/heads/codex/monorepo-audit-2026-09
83de20a293789e1aadf8fa2f034804c067c4e26c	refs/heads/feat/office-base-v1
29bcf5cb237325e3d6f58a4085834837928f2f8c	refs/heads/main
```

One `ls-remote` carries the symbolic HEAD and every head, so the branch list costs no extra round trip.
`origin`, `origin/HEAD` and the `origin/` prefix are dropped, the default branch goes first.

### The AppleScript the daemon runs, checked before it was written into the fallback

```
$ osascript -e 'on run argv' -e 'return item 1 of argv' -e 'end run' -- hello
hello
$ osascript -e 'on run argv' -e 'return POSIX path of ((item 1 of argv) as POSIX file)' -e 'end run' -- /tmp
/tmp
$ osacompile -o /tmp/check.scpt -e 'on run argv' \
    -e 'set chosen to choose folder with prompt (item 1 of argv) default location ((item 2 of argv) as POSIX file)' \
    -e 'return POSIX path of chosen' -e 'end run'
(exit 0 — compiles)
```

`--` ends option parsing and the arguments reach `run argv`, so the prompt and the starting directory
are never part of the script source.

### The office, driven in a browser against a live daemon

An isolated daemon (`HO_HOME=<scratch>`, port 47810) serving the production UI bundle:

```
$ curl -s http://127.0.0.1:47810/health
{"ok":true}
```

- Empty office → "Add a project (floor)" → the dialog opens with the source switch on "Folder on this
  machine", the folder button beside the path, and the branch select disabled ("filled in once git
  answers").
- Typing `…/home-office/packages/ui` (a subdirectory, not the repository root): hint
  `git repository · 13 branches`, floor name filled with `home-office`, and the select holds exactly
  the 13 branches with `main` selected — `origin/*` duplicates removed, default first:
  `["main","audit/deep-monorepo-audit-2026-09","codex/monorepo-audit-2026-09","codex/office-art-base","feat/add-project-picker-and-airier-ui","feat/floors-andrew-lola","feat/office-base-v1","ho/add-contributing-md-04a0d2d4","ho/task-01a0830f…","ho/task-01a08328…","ho/task-01a08341…","ho/task-01a08347…","ho/zjistit-hlavn-zpr-vu-dne-na-seznam-cz-zp-8b64a75d"]`
- "Git URL" with `git@github.com:misaon/home-office.git` (git's scp shorthand, not a URL): hint
  `git repository · 4 branches`, select `["main","audit/deep-monorepo-audit-2026-09","codex/monorepo-audit-2026-09","feat/office-base-v1"]`,
  "Create floor" enabled.
- `not-a-repo` in the same field: `Not a repository URL — use https://host/org/repo,
ssh://git@host/org/repo or git@host:org/repo` in red, name and branch cleared, Create disabled, and
  no request sent — the URL is rejected in the page, not by the daemon.
- The folder button: the daemon spawned the dialog with the typed path as its starting location, and
  the arguments are arguments —

```
$ ps -ww -o command -p $(pgrep -f osascript)
osascript -e on run argv -e set chosen to choose folder with prompt (item 1 of argv) default location
((item 2 of argv) as POSIX file) -e return POSIX path of chosen -e end run -- Choose the repository
folder /Users/ondrejmisak/WebstormProjects/home-office/packages/ui
```

Dismissing it returned `cancelled`: the field kept what was typed and no error appeared.

The panel itself was measured on its own, because an agent's sandboxed shell cannot reach the window
server and the dialog opened there is dismissed for it after ten seconds:

```
$ osascript ... 'choose folder with prompt (item 1 of argv)' ...      (sandboxed shell)
26:68: execution error: Operace byla zrusena uzivatelem. (-128)       10.2 s, exit 1

$ bun run pick-probe.ts  →  osascriptDirectoryPicker({})              (no sandbox)
{"status":"cancelled"} after 46171 ms
```

Outside the sandbox the panel stays up and waits — 46 seconds here, until it was dismissed — and the
adapter turns AppleScript's `-128` into `cancelled` instead of an error. `picked`, the branch that
writes the chosen path into the field, is the one case still unverified: it needs a person to press
Choose.

- "Create floor" created the floor; the office drew its plan, the header tab, Andrew in the chat panel
  and the setup checklist.

### White text on the accent buttons, found by the owner

The airier pass added a form reset — `input, select, textarea, button { font: inherit; color: inherit }` —
outside any `@layer`. Unlayered CSS outranks every layered utility, so `text-black` lost and the yellow
buttons and the active floor tab drew near-white text on yellow. Tailwind's own preflight already carries
that exact reset in `base`:

```
$ grep -o 'button,[^{]*{[^}]*}' packages/ui/dist/*.css
button,input,select,optgroup,textarea{font:inherit;…;color:inherit;opacity:1;background-color:#0000;border-radius:0}
```

The duplicate is gone and the one rule worth keeping (a dropdown's platform-drawn list needs the office's
ground stated) moved into `@layer base`. Measured in the browser after the rebuild:

```
before  Create floor  color rgb(230, 230, 230)  background rgb(255, 209, 102)
        1 home-office color rgb(230, 230, 230)  background rgb(255, 209, 102)
after   Create floor  color rgb(0, 0, 0)        background rgb(255, 209, 102)
        1 home-office color rgb(0, 0, 0)        background rgb(255, 209, 102)
```

### "Not Found" under the input, found by the owner

The owner clicked the folder icon against the daemon that was already running in a terminal and got
`Not Found` under the field and no dialog. The daemon and the UI bundle deploy separately — the daemon
serves the bundle from disk, so `bun run ui:build` gives a running daemon a UI newer than itself:

```
$ curl -s http://127.0.0.1:47800/health   → {"ok":true}   started 11:57 local (pid 82774)
$ git log -1 --format=%ad 2fcaa24          → 12:39 local   (the commit that adds system.pickDirectory)
```

Reproduced in the browser against that same daemon (`Repository folder / Not Found`), which is oRPC's
`NOT_FOUND` for a procedure the router does not have. The message now says what to do, and the check is
structural rather than `instanceof` — the error crosses a WebSocket and its class need not be the one
the bundle imported:

```
before  Repository folder / Not Found
after   Repository folder / This daemon is older than the office and cannot open a folder dialog —
        restart it, reload, or type the path.
```

Verified in both directions: the sentence above on the 11:57 daemon, and on a daemon built from this
branch the same click spawns the panel —

```
$ pgrep -fl osascript
80823 osascript -e on run argv -e set chosen to choose folder with prompt (item 1 of argv) …
      -- Choose the repository folder
```

### The right panel could not scroll, found by the owner

Settings, Agent, Usage and Resources are plain blocks of content with `overflow-y-auto`, but nothing
constrained their height, so each grew to its content and the panel's `overflow-hidden` wrapper simply
cut the rest off. The airier pass is what exposed it: the same content no longer fits. Measured in the
browser at 1440×900, on the Settings panel, by toggling the added `h-full`:

```
without h-full   clientHeight 1738  scrollHeight 1738  scrollable false   (wrapper overflow: hidden)
with    h-full   clientHeight  855  scrollHeight 1738  scrollable true    (scrollTop 400 sticks)
```

Chat and Board were already `flex h-full flex-col` with their own `flex-1` scroll area and were never
affected; the four block panels now state `h-full` themselves.

### Checks

```
$ bun run check
✔ 16/16 tsconfig targets · oxlint --type-aware --deny-warnings clean · oxfmt 324 files
knip clean · ui: 3 files, 1123 KiB
```

Not covered: the desktop app's own `Utils.openFileDialog` panel (it needs the packaged Electrobun app,
where the daemon runs in-process and receives the native picker), and a folder actually chosen in the
dialog rather than dismissed.
