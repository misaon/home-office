# Home Office — Implementation Plan

**Status:** plan confirmed by the owner on 2026-09-06 ("yes", plus D11–D14). Phase 0 in progress. Companion docs: `ARCHITECTURE.md` (how), `STACK.md` (with what, verified versions), `CONVENTIONS.md` (rules). Agents working on this repo: read `AGENTS.md` first, then this file; append to § Log when you finish a task.

## 1. Vision (restated requirements)

A monorepo **local multi-agent harness**: a desktop app (macOS Apple Silicon first, unsigned download from GitHub Releases) shows a pixel-art office in the LimeZu _Modern Office_ style. Employees are AI agents (name, appearance, gender, model, effort, base prompt, specialisation). A boss agent receives work from a chat panel on the right (or, later, from a postman delivering GitHub issues to a mailbox) and delegates to workers; workers hand work to each other **visibly** (walk over, hand it off). Idle agents wander, drink coffee, use the toilet, smoke, relax, sleep; emotions show in bubbles. Each agent session runs in an isolated Alpine-based Docker container; containers, caches and volumes are cleaned up aggressively. Everything is provider-agnostic (Claude first via **subscription**, later API keys, other CLIs, local LLMs) and sandbox-agnostic (Docker now, GCP later) through shared interfaces. Multiple repositories are first-class (one floor per project). Runs headless as a CLI on a server too. TypeScript everywhere on Bun, strictest typing and linting, ultra-modern stack, token- and hardware-frugal, secure. No tests in this phase.

## 2. Decisions (with the owner, 2026-09-06)

| #   | Decision                                                                                                                            | Rationale                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Electrobun 2.0** desktop shell, `build.mainProcess: "bun"`, unsigned macOS builds                                                 | Pure TS/Bun, main process is the daemon (no sidecar), typed RPC, delta updater. Tauri 2.11 is the documented fallback if Electrobun blocks a spike. |
| D2  | **Docker Engine API directly** via Bun `fetch({ unix })`; Swarm mode unused                                                         | Ephemeral per-session containers, precise lifecycle/GC, zero deps; Swarm services fit long-running replicas, not tasks.                             |
| D3  | **One floor per project** (tabs) + shared Lobby floor + elevator                                                                    | Owner's choice; scales with many projects; cross-project handoffs become elevator trips.                                                            |
| D4  | **Isolated clone per task**, results pushed as `ho/*` branches by a `git-bridge` helper; agent containers never mount the host repo | Safe parallelism, no host FS exposure, portable to cloud.                                                                                           |
| D5  | **Claude Code CLI headless** (`stream-json`) with `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` (Team plan)                      | Official subscription path for scripts/CI; Agent SDK is explicitly not allowed with claude.ai login.                                                |
| D6  | **ACP-shaped `AgentRuntime`** interface                                                                                             | Lets Gemini CLI, OpenCode (local LLMs) and Codex plug in via one generic ACP adapter later.                                                         |
| D7  | **Runner connects back** (compiled Bun `ho-runner` dials the daemon's WebSocket)                                                    | Avoids Docker attach/hijack; token never in image/container/exec metadata; same for cloud.                                                          |
| D8  | **ECC** skills vendored per role (small subsets), **RTK** hook in the image                                                         | Quality without paying for 286 skills of context on every turn.                                                                                     |
| D9  | oxlint + tsgolint + oxfmt + knip on TypeScript 7                                                                                    | Type-aware linting on the native compiler; strictest practical setup.                                                                               |
| D10 | Tests deferred to Phase 8 (owner)                                                                                                   | Prototype speed; design for testability anyway.                                                                                                     |
| D11 | License **MIT**                                                                                                                     | Owner confirmation 2026-09-06.                                                                                                                      |
| D12 | Default boss model **`opus`** at `high`; workers `sonnet`/`medium`, reviewer `sonnet`/`high`, clerk `haiku`/`low`                   | Owner confirmation; `opus` is the Team default alias.                                                                                               |
| D13 | Defaults: global concurrency **2**, task-volume retention **24 h**, idle stop 10 min                                                | Owner confirmation.                                                                                                                                 |
| D14 | `.claude/` settings inside cloned project repos are **not loaded** into sessions (per-project opt-in later)                         | Owner confirmation; keeps context lean and prevents repo-supplied hooks from running.                                                               |

## 3. Non-goals for now

Code signing/notarization · Windows/Linux packaging · cloud sandbox provider · Jira connector · multi-user/auth beyond a local token · tests · usage credits (owner pays nothing beyond the Team subscription).

## 4. Phases

Each task has an id (`P<phase>.<n>`), an **Acceptance** line and a **Validate** hint. Order within a phase is a suggestion; dependencies are noted.

### Phase 0 — Foundations and de-risking spikes (Complexity: Medium)

Goal: a green monorepo skeleton and hard evidence that the five risky assumptions hold on this machine.

- [x] **P0.1 Repo scaffold.** Root `package.json` (workspaces `apps/*`, `packages/*`, `catalog` with every version from `STACK.md`), `bunfig.toml` (`linker="isolated"`, `exact=true`), `tsconfig.base.json` + project references, `.oxlintrc.json` (type-aware), `.oxfmtrc.json`, `knip.json`, `.editorconfig`, `.gitignore`, `.gitattributes`, `LICENSE` (owner to confirm MIT), `AGENTS.md` + `CLAUDE.md` (`@AGENTS.md`), README. Scripts: `check` (tsc + lint + fmt:check + knip), `lint`, `fmt`, `dev`, `build`. Verify `tsc -b` works on TS 7.0; fall back to `bun run --filter '*' typecheck`.
      Acceptance: `bun install && bun run check` passes on an empty workspace with one placeholder package. Validate: `bun run check`.
- [x] **P0.2 CI.** `.github/workflows/ci.yml` on `ubuntu-latest`: `oven-sh/setup-bun`, frozen install, `bun run check`. Acceptance: green run on `main`.
- [ ] **P0.3 Spike S1 — Claude Code headless in Alpine arm64.** `images/agent/Dockerfile` (alpine 3.22, `apk add bash curl libgcc libstdc++ ripgrep git`, Claude Code from the official apk repo with key verification, non-root `agent`, `USE_BUILTIN_RIPGREP=0`). Run `claude -p --output-format stream-json …` with `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, model `haiku`, `--max-turns 2`. Record cold-start time, `system/init` payload, `result.usage`, and confirm `--permission-mode bypassPermissions` works as non-root and `--bare` does **not** authenticate.
      Acceptance: JSONL result with `session_id` and usage; a follow-up turn via `--resume` works. Validate: `bun spikes/s1-claude-alpine.ts`.
- [ ] **P0.4 Spike S2 — Electrobun + Bun main process + PixiJS.** `bunx electrobun init`, set `mainProcess: "bun"`, prove `bun:sqlite`, `Bun.serve` WebSocket and `fetch({ unix })` work in the main process; webview renders a Pixi 8 scene (WebGPU or WebGL in WKWebView) at 3× pixel scale with `roundPixels`; `hutch electrobun build:release` with `mac.codesign:false` produces a DMG/zip that opens after `xattr -cr`.
      Acceptance: unsigned app launches, shows 60 sprites moving, WS round-trip from webview to Bun. If blocked: document and switch D1 to Tauri.
- [ ] **P0.5 Spike S3 — Docker Engine API from Bun + runner-connects-back.** Create network/volume/container via API 1.55 over the unix socket (`fetch({ unix })`), start, `exec` a detached `ho-runner` (compiled `bun-linux-arm64-musl`) that dials `ws://host.docker.internal:<port>` with a one-time token, relays a child process's stdout/stdin as JSONL, then remove everything by label.
      Acceptance: end-to-end echo through the container in < 3 s; `docker ps -a --filter label=ho.managed` empty afterwards.
- [ ] **P0.6 Spike S4 — oRPC over WebSocket on Bun.** Contract with a query, a mutation and an event-iterator subscription; server in Bun, client in the webview. Acceptance: typed client compiles, 1,000 events stream without leaks.
- [ ] **P0.7 Spike S5 — git-bridge.** Alpine+git image; clone host repo (RO mount) into a volume, commit inside a second container, push back to `ho/spike` via a RW bridge run. Acceptance: branch appears in the host repo; host working tree untouched.
- [ ] **P0.8 Sprite pipeline.** `assets/README.md` with the asset request list (below), naming convention, `assets/pack.ts` (Bun.Image or a small packer) producing PixiJS spritesheet JSON. Acceptance: one packed sheet loads in S2.

**Exit criteria:** S1–S5 pass (or documented pivots), `bun run check` green, CI green, Log updated. Spikes are deleted or promoted into packages in Phase 1–2.

### Phase 1 — Protocol, core domain, store, daemon skeleton, CLI (Complexity: Medium)

- [ ] **P1.1 `@ho/protocol`.** Branded IDs, Zod schemas for Project/Agent/Task/Session/Handoff/ChatMessage/MailItem, the `DomainEvent` discriminated union, oRPC contract (`projects.*`, `agents.*`, `tasks.*`, `sessions.*`, `chat.*`, `events.subscribe`, `usage.*`, `resources.*`, `system.health`), MCP tool input/output schemas. Acceptance: contract compiles and `knip` is clean.
- [ ] **P1.2 `@ho/core`.** Ports (§5 of ARCHITECTURE), task state machine (pure transition function with exhaustive checks), scheduler (queue, per-agent/global concurrency, budgets, rate-limit pause), handoff rules, `Result` type, `Clock`. Acceptance: pure package, zero runtime imports of Bun/DOM.
- [ ] **P1.3 `@ho/store`.** Drizzle schema (`events`, `projections_*`), migrations (`drizzle-kit`), `EventStore` on `bun:sqlite` WAL, projections rebuilt from events on startup, snapshot on shutdown. Acceptance: append/read/subscribe; rebuild of 100k events < 2 s.
- [ ] **P1.4 `@ho/secrets`.** Keychain via `security` CLI, file fallback, Zod-validated config loader for `~/.config/home-office/config.json`. Acceptance: round-trip set/get/delete.
- [ ] **P1.5 `@ho/daemon` skeleton.** Composition root, pino logging, `Bun.serve` with oRPC WS handler + bearer token, static UI serving stub, health endpoint, graceful shutdown, GC job scaffold. Acceptance: `ho daemon` starts, `ho system health` answers over oRPC.
- [ ] **P1.6 `apps/cli`.** `ho daemon`, `ho project add|list|remove`, `ho agent add|list|edit`, `ho task create|list|show`, `ho chat "<text>"`, `ho tail` (event stream), `ho doctor`. Compiled with `bun build --compile`. Acceptance: create a project and an agent, see events in `ho tail`.

### Phase 2 — Sandbox and Claude Code runtime (Complexity: High)

- [ ] **P2.1 `@ho/sandbox-docker`.** `SandboxProvider` over Engine API 1.55: images (build via `docker buildx build` subprocess with content-hash label; everything else via API), volumes, network `ho-agents` (ICC off), create with hardening (§11), start/stop/remove, `exec` detached, stats, prune by label/age, health (`/version`, `/system/df`). Acceptance: full lifecycle from the CLI; `ho doctor --prune` leaves nothing labelled `ho.managed` behind.
- [ ] **P2.2 Agent image.** Multi-stage Dockerfile: RTK built for aarch64-musl (stage `rust:alpine`), Claude Code via apk (pinned version), git, `ho-runner`, `/opt/ho/plugins/<role>` from `@ho/agent-kit`, `/etc/ho/claude-settings.json` (hooks: RTK; env; `autoCompactWindow`), `/etc/ho/mcp.json` (HO MCP server, `${HO_MCP_URL}`/`${HO_SESSION_TOKEN}` expansion). Non-root. Acceptance: image < 400 MB, `claude --version` works as `agent`.
- [ ] **P2.3 `ho-runner`.** Dials the daemon WS with the one-time token, receives `{ argv, env, secrets }`, spawns `claude`, relays JSONL both ways with back-pressure, forwards exit code, heartbeats. Acceptance: kill/interrupt semantics (SIGINT ends the turn, SIGTERM exits 143) verified.
- [ ] **P2.4 `@ho/runtime-claude-code`.** Command assembly (§6), stream-json codec (Zod), normalisation to `RuntimeEvent`, usage capture from `result`, `api_retry` → `rate_limited`, error codes (`authentication_failed`, `billing_error`, …), resume tokens. Acceptance: a task brief produces a `result` and `usage.recorded` events; a forced 429 path pauses the scheduler.
- [ ] **P2.5 git-bridge integration.** Clone on session start, push on report, branch naming, retention GC, optional `gh pr create` on the host (off by default). Acceptance: end-to-end "fix a typo" task produces branch `ho/<slug>` in the host repo.
- [ ] **P2.6 Usage and resources projections.** Tokens per agent/task/day, cache-hit share, containers/volumes/disk snapshot every 60 s. Acceptance: `ho usage` and `ho resources` print live numbers.

### Phase 3 — Boss, handoffs, review, budgets (Complexity: High)

- [ ] **P3.1 HO MCP server.** Streamable HTTP on the daemon (`@modelcontextprotocol/sdk`), per-session bearer scope, tools `ho_delegate`, `ho_handoff`, `ho_report`, `ho_ask_human`, `ho_task_status`, `ho_list_agents`; every call → event. Acceptance: tools appear in `system/init.mcp_servers` and are callable from a session.
- [ ] **P3.2 Boss persona and roster prompt.** Role prompt (≤60 lines), roster rendering (agents, skills, load, projects), decomposition guidance, protocol enforcement (must use tools). Acceptance: a chat brief yields ≥1 delegated task with acceptance criteria.
- [ ] **P3.3 Worker and reviewer protocol.** Role prompts, `ho_report` schema, review loop with round cap, back-to-work findings. Acceptance: a task passes through `in_progress → review → done` with two distinct agents.
- [ ] **P3.4 Handoff engine.** `handoff.started` → wait for `office.handoff_delivered` (or timeout) → start target session with brief + branch; cross-project handoff moves the branch reference, never files. Acceptance: visible handoff gating verified with the UI in Phase 4 (until then a mocked completion).
- [ ] **P3.5 Budgets, concurrency, rate limits.** Global/agent concurrency, per-task turn/time caps, `rate_limited` pause with `retryAt`, "sleep" state for agents, resume after reset. Acceptance: with `maxConcurrent=1`, two tasks serialise; a simulated rate limit pauses and resumes.
- [ ] **P3.6 Chat.** Human ↔ boss streaming messages, task cards, `ho_ask_human` prompts with reply routing to the waiting session. Acceptance: `ho chat` round-trip with a question and an answer.

### Phase 4 — Office simulation and UI (Complexity: High)

- [ ] **P4.1 `@ho/sim` core.** Floor templates (Lobby + project template JSON), grid + A*, seat/anchor reservations, elevator, 20 Hz deterministic tick, seeded RNG. Acceptance: headless run of 10 agents for 10 simulated minutes with zero collisions/deadlocks.
- [ ] **P4.2 Behaviours and emotions.** Needs model, idle behaviours (coffee, restroom, smoke, relax, chat pairs, sleep), event→intent mapping (§9), emotion derivation. Acceptance: table of event → visible behaviour verified in a debug harness.
- [ ] **P4.3 `@ho/ui` shell.** React 19 + Compiler, Tailwind 4, Zustand store fed by `events.subscribe`, oRPC client with the launch token, layout (canvas left, chat right, panels). Acceptance: connects to a running daemon and renders live agent statuses.
- [ ] **P4.4 Pixi renderer.** Layers (baked tiles, furniture, characters z-sorted, bubbles), 3× pixel scale, spritesheet loading from `assets/`, 30 fps cap, pause on hidden, floor switching, building strip. Acceptance: 12 agents at < 5% CPU on the dev MacBook when idle.
- [ ] **P4.5 Panels.** Board (per project columns), Agent inspector (normalised event log, branch, usage), Usage, Resources (prune button), Settings (projects, agents with appearance picker, budgets, auth token). Acceptance: every mutation in Settings round-trips to config and events.
- [ ] **P4.6 Handoff and boss animations wired to Phase 3.** `office.handoff_delivered` emitted by the sim through RPC. Acceptance: a real delegation shows the boss walking/elevator/handing over before the worker's container starts.

### Phase 5 — Desktop packaging and first run (Complexity: Medium)

- [ ] **P5.1 `apps/desktop`.** Electrobun config (`mainProcess: "bun"`, `mac.codesign:false`, `copy` of the built UI bundle), main process starts `@ho/daemon`, Electrobun RPC for window/menu/dialogs/open-external and passing the launch token to the webview, single-instance lock, quit → graceful daemon shutdown (stop sessions, GC). Acceptance: `hutch electrobun dev` runs the full app.
- [ ] **P5.2 First-run wizard.** Docker check (API version ≥ 1.44, disk), image build with progress, token entry (`claude setup-token` instructions + paste, stored in Keychain), smoke session with `haiku`, default agents (boss + 2 workers + reviewer) and floor templates. Acceptance: fresh `HO_HOME` reaches a working office in < 10 min including image build.
- [ ] **P5.3 Release workflow.** `release.yml` on tag: `macos-26` runner, `bun install`, build UI, `hutch electrobun build:release`, upload DMG/zip + checksums to GitHub Releases with `xattr -cr` instructions in release notes. Acceptance: downloaded artifact runs on the owner's Mac.
- [ ] **P5.4 Server/CLI parity.** Daemon serves the UI bundle over HTTP; `ho daemon --ui` prints the URL with the token in a local file, not the URL. Acceptance: same UI works in a browser against `ho daemon`.

### Phase 6 — Intake: postman, mailbox, GitHub Issues (Complexity: Medium)

- [ ] **P6.1 `IntakeConnector` + `@ho/intake-github`.** Poll `gh issue list --json …` per project (labels/filters configurable), dedupe by id, `mail.received` events, acknowledge by comment/label and PR link on completion. Acceptance: a new issue becomes a task within one poll interval.
- [ ] **P6.2 Postman and clerk choreography.** Postman spawn/entrance/mailbox drop; clerk (or idle worker) fetches to the boss; boss triage via `ho_delegate` or `ho_report(blocked)` for unclear issues (asks in chat). Acceptance: visible pipeline from issue to delegated task.
- [ ] **P6.3 Connector settings UI.** Enable per project, interval, filters, dry-run.

### Phase 7 — Provider agnosticism (Complexity: Medium/High)

- [ ] **P7.1 `ProviderRegistry` + `ModelCatalog`** in protocol/core: providers declare models, effort levels, auth kinds; agent editor shows only valid combos.
- [ ] **P7.2 `@ho/runtime-acp`.** Generic ACP client (`@agentclientprotocol/sdk`) over the runner relay: `initialize`, `session/new`, `session/prompt`, `session/update` → `RuntimeEvent`, `session/request_permission` policy. First targets: OpenCode (`opencode acp`, local models via Ollama/LM Studio), Gemini CLI (`gemini --acp`). Codex via `codex-acp` or `codex exec --json` (ChatGPT auth is possible but OpenAI discourages it for automation; API key path documented).
- [ ] **P7.3 Image variants.** Per-runtime image layers (claude-code | opencode | gemini | codex) selected by provider; still one base.
- [ ] **P7.4 Anthropic API-key mode.** `ANTHROPIC_API_KEY` from `SecretStore` as an alternative auth profile for Claude Code sessions; optional `--max-budget-usd`.

### Phase 8 — Hardening, observability, tests (Complexity: Medium)

- [ ] **P8.1 Egress allowlist proxy** container (Bun CONNECT proxy) + `HTTPS_PROXY` in sessions; per-project extra hosts.
- [ ] **P8.2 Remote/server mode.** `--host`, TLS via `Bun.serve({ tls })`, long-lived tokens, docs for SSH tunnel/Tailscale.
- [ ] **P8.3 Terminal inspector.** `@xterm/xterm` view of a session's container logs / `Bun.Terminal` exec for debugging.
- [ ] **P8.4 Tests.** `bun test`: core state machine, scheduler, sim determinism, stream-json codec fixtures, store; integration behind `HO_TEST_DOCKER=1`; UI smoke via `Bun.WebView`.
- [ ] **P8.5 Performance and disk audit.** One week of simulated use in a loop: assert no growth in images/volumes/db beyond policy.
- [ ] **P8.6 Docs and ADRs.** `docs/adr/` for D1–D10 and later decisions; codemaps.

### Future (tracked, not scheduled)

GCP `SandboxProvider` (Cloud Run Jobs), Jira/Linear connectors, Windows/Linux builds, code signing when an Apple account exists, multiple offices/companies, voice notifications.

## 5. Asset request list (for the owner to generate, LimeZu Modern Office style, 16×16, PNG, transparent)

1. **Characters** (per appearance variant, ≥4 variants + boss + postman): idle and 4-direction walk (4 frames each), sit-typing (2 frames), sit-idle, drink coffee (2), sleep (2), hand-over (2), receive (2). 32×32 canvas per frame, feet at the bottom centre.
2. **Emotion bubbles**: focused, happy, frustrated, confused/question, sleepy (zzz), relaxed, talking (…), envelope. 16×16.
3. **Tiles**: floor (office carpet, kitchen tile, lobby), walls (N/S/E/W + corners), doors, elevator (closed/open, 2 frames), windows.
4. **Furniture**: desk + monitor (on/off/typing frames), chairs (4 dirs), boss desk, reception counter, whiteboard/board, mailbox (empty/full), coffee machine (idle/brewing), fridge, sink, sofa, armchair, plant, water cooler, toilet, sink, ashtray/smoking sign, bookshelf, printer.
5. **Props**: folder/document for handoffs, coffee cup, envelope.

Naming: `assets/src/<category>/<name>[_<variant>][_<dir>][_f<frame>].png`; the packer produces `assets/dist/<sheet>.png` + `.json`.

## 6. Risks

| Risk                                                                             | Likelihood | Impact | Mitigation                                                                                    |
| -------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------- |
| Electrobun maturity (single maintainer, docs drift, Bun-runtime mode edge cases) | Medium     | High   | Spike S2 gates D1; daemon is shell-agnostic; Tauri fallback documented.                       |
| Subscription rate limits (5-hour + weekly windows) throttle a multi-agent office | High       | High   | Concurrency caps, Sonnet/Haiku for workers, RTK, lean context, rate-limit pause, usage panel. |
| Anthropic policy changes around headless/subscription use                        | Low–Medium | High   | Use only the official CLI and `setup-token`; API-key mode as fallback (Phase 7.4).            |
| TypeScript 7.0 tooling gaps (no compiler API; `tsc -b` behaviour)                | Medium     | Low    | Oxc toolchain only; verify in P0.1; TS 7.1 restores an API.                                   |
| Docker Desktop VM RAM (~8 GB) limits concurrent containers                       | Medium     | Medium | Memory limits per session, default concurrency 2, idle stop, doctor warnings.                 |
| RTK lossy compression hides a relevant error                                     | Low        | Medium | Exclude risky commands via `~/.config/rtk/config.toml`; agents can rerun without `rtk`.       |
| Prompt cache misses across resumed sessions inflate usage                        | Medium     | Medium | Keep sessions alive within 1 h, never mutate system prompt/tool set mid-session.              |
| Sprite production bottleneck                                                     | Medium     | Low    | Placeholder generated sprites in Phase 4; asset list published early (§5).                    |
| Disk growth from images/volumes/caches                                           | Medium     | Medium | Labels + GC job + retention policies + Resources panel; P8.5 audit.                           |

## 7. Open questions for the owner

1. License for the repo (proposal: MIT).
2. Default boss model: `opus` (Team default) vs `fable` at `high` (Fable usage counts more against the window).
3. Default global concurrency (proposal: 2) and task-volume retention (proposal: 24 h).
4. Whether `.claude/` settings inside cloned project repos may load into sessions (proposal: off by default, per-project opt-in).

## 8. Log

Append entries as `- YYYY-MM-DD — <task id or topic> — <outcome> — <follow-ups>`.

- 2026-09-06 — Planning — Fresh start (previous session ignored by owner request). Researched and verified stack for September 2026 (see STACK.md sources). Owner decisions D1–D4 recorded. Plan awaiting confirmation; no code written.
- 2026-09-06 — Plan confirmed — Owner answered the open questions (D11–D14) and said "yes". Phase 0 started.
- 2026-09-06 — P0.1, P0.2 — Monorepo scaffold green: Bun workspaces + catalog, isolated linker, TS 7.0.2 (`scripts/typecheck.ts` runs `tsc -p` per workspace concurrently; `tsc -b` not used because referenced projects may not `noEmit`), oxlint 1.81 type-aware via oxlint-tsgolint (categories correctness/suspicious/pedantic/perf = error, style off with a curated allowlist; `eslint/no-redeclare` off to allow the Zod schema+type same-name idiom), oxfmt, knip, CI workflow, git hook, `@ho/protocol` with branded UUIDv7 ids. — Follow-ups: pin GitHub Actions to the majors verified today (checkout v7, setup-bun v2).
