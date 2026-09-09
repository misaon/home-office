# Home Office technology stack

Reviewed 2026-09-09. Exact application dependency pins live in the root `package.json` catalog and
`bun.lock`. Sandbox npm trees have their own `package-lock.json` files. Version numbers below record
what this repository uses, not a promise that a release remains the newest. Recheck vendor sources and
compatibility before updating. The September 2026 deep audit records how each choice was checked, what it
measured and which recommendations it withdrew: [findings](../audit/AUDIT.md),
[the dependency sweep](../audit/DEPENDENCIES.md) and [ADR 004](../audit/adr/004-stack-review.md) /
[ADR 005](../audit/adr/005-library-candidates.md). An [earlier audit report](history/AUDIT-2026-09.md) is
kept as history and is not evidence about the current tree.

## Implemented stack

| Area                      | Dependency / version                                  | Purpose                                                                                                                      |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Runtime / package manager | Bun 1.4.2                                             | TypeScript execution, SQLite, HTTP/WS, compiled executables, isolated workspaces and catalogs                                |
| Types                     | TypeScript 7.0.2                                      | Native compiler; explicit strict options in `tsconfig.base.json`                                                             |
| Lint                      | oxlint 1.82.0, oxlint-tsgolint 7.0.2001               | Type-aware, pedantic, React hooks and accessibility checks                                                                   |
| Format / unused code      | oxfmt 0.67.0, Knip 6.35.0                             | Formatting and workspace-aware source/dependency coverage, including CSS                                                     |
| Validation / RPC          | Zod 4.5.4, oRPC 1.15.0                                | Boundary validation and shared client/server contract                                                                        |
| Persistence               | Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, `bun:sqlite` | Embedded event log and schema migrations                                                                                     |
| Logging                   | Pino 10.3.1                                           | Structured NDJSON; the desktop app's file destination rotates at 8 MiB, keeping one previous file                            |
| Single instance           | `fs.mkdir` plus a pid liveness check                  | Own ~25 lines; replaced proper-lockfile, which had gone quiet (ADR 005)                                                      |
| Desktop                   | Electrobun 2.0.1, Hutch 0.25.0                        | Native shell with the daemon in its Bun main process                                                                         |
| UI                        | React / React DOM 19.2.8                              | Panels compiled with Bun's React Compiler integration                                                                        |
| Client state              | Zustand 5.0.15, TanStack Query 5.102.8                | Event projection and abortable cached RPC queries                                                                            |
| Styling / build           | Tailwind CSS 4.3.3, bun-plugin-tailwind 0.1.2         | CSS and HTML-entry UI builds                                                                                                 |
| Rendering                 | PixiJS 8.20.1                                         | Sprite batching, static floor textures and animated office rendering                                                         |
| Image processing          | Sharp 0.35.4                                          | PNG encoding for the desktop app icon                                                                                        |
| Pathfinding queue         | TinyQueue 3.0.0                                       | Heap for the simulation's weighted A* search                                                                                 |
| Agent protocols           | ACP SDK 1.4.0, MCP SDK 1.30.0                         | Provider sessions and scoped office tools                                                                                    |
| Secrets                   | `Bun.secrets`, atomic file fallback                   | Keychain / libsecret / Credential Manager, chosen by whether the host store answers; no secret ever in a subprocess argument |
| Types / CLI               | type-fest 5.9.0 (dev), yoctocolors 2.2.0              | One typed `compact()` helper instead of 62 spread guards; CLI colour gated on a TTY                                          |

The root esbuild override to 0.28.2 removes the vulnerable Drizzle Kit transitive version. Check Drizzle
schema generation when changing it. The native secret API is experimental; retain the explicit file
backend as an operational fallback. Do not assume API compatibility with arbitrary Node tooling just
because Bun executes TypeScript — `Bun.timingSafeEqual` does not exist in 1.4.2, for one, and the audit
had to fall back to `node:crypto` for it.

The office UI is built with Bun's `reactCompiler: true`, so components are memoised by the compiler.
That is why the panels contain no hand-written `useCallback`/`useMemo`: adding them back would duplicate
what the compiler already does. It also means a UI change must be verified through `bun run ui:build`
(part of `bun run check`) rather than by reading the source alone.

## Build and sandbox pins

`bun run devkit` fetches Hutch revision `5668321389b6f47e24a2408c963ef5a437793b4c`, verifies the
platform archive's SHA-256 and projects the desktop devkit. `scripts/devkit.ts` is the pin source. No
remote install script is executed. `bun run desktop:build` assembles resources and creates an unsigned
macOS arm64 application/DMG. The complete build was verified locally during the audit.

The sandbox runner ships as a `bun build --target=bun --minify` bundle (`images/agent/bin/ho-runner.js`,
about 119 KB) executed by the Bun the image already installs, not as a compiled binary — that removed a
second copy of the Bun runtime from every agent image (1.76 → 1.69 GB).

Agent images target Linux arm64. Alpine 3.24.1 and the Rust builder are pinned by image digest in the
Dockerfile. Alpine's package repositories remain moving security-update channels; digest-pinning the
base alone does not freeze every installed APK. Chromium, Node and npm come from that supported Alpine
branch. Bun 1.4.2 is installed from the official musl arm64 archive with an explicit checksum. RTK 0.48.0
is compiled from source commit `fde0a8f185945556f51718de0f4c430bb62b3df6` using its Cargo lockfile.

| Image target  | Installed provider                                          | Invocation                                       |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `claude-code` | Official Claude Code APK 2.1.263-r1                         | `claude -p` with stream-json input/output        |
| `opencode`    | opencode-ai 1.18.29                                         | `opencode acp --cwd <repo>`                      |
| `gemini-cli`  | @google/gemini-cli 0.58.0                                   | `gemini --acp --model <id> --approval-mode yolo` |
| `codex`       | @agentclientprotocol/codex-acp 1.10.0, locked Codex 0.153.4 | `codex-acp`, model/effort via `CODEX_CONFIG`     |

Browser MCP packages are @playwright/mcp 0.0.80 and chrome-devtools-mcp 1.9.0, preinstalled with locked
transitive dependencies. They use Alpine Chromium, not downloaded browser builds. Both images and
runtime code must be reviewed when their CLI flags change. Playwright is exposed by default; DevTools
is opt-in. All four image targets and git-bridge built during the audit; npm audits reported no known
vulnerabilities in their locked npm trees. That is not a comprehensive OS-image vulnerability scan.

## Framework and library decisions

- Keep React and PixiJS. React already supplies the application framework; server rendering would add
  little to an authenticated local webview. Pixi handles rendering while deterministic office logic
  stays in a pure package. Phaser 4 is a viable game framework, but migrating now would still require
  the same envelope, task, reservation and provider logic. Consider it if scene authoring, physics or
  game-specific input becomes the main workload, and validate a representative floor first.
- Keep Electrobun after its full build passed. Its small shell and in-process Bun daemon suit the
  application. Tauri is the fallback if native window behavior, accessibility, packaging or supported
  platforms become blockers; it would require managing the daemon as a separate sidecar. Electron is
  viable if consistent Chromium behavior becomes more valuable than installation/RAM cost.
- Keep Bun workspaces without Nx/Turborepo for now. There are 16 compiler targets and one UI bundle;
  bounded compilation already limits peak process count. Introduce a task cache when measured CI time
  or repeated builds justify maintaining another build graph.
- Keep SQLite/Drizzle for a single local writer. A server database does not fix event replay growth.
  Add event snapshots/retention and measured query indexes before introducing a database service.
- Use focused libraries for maintained commodity logic where one exists and is alive: Sharp for the PNG
  codec, TinyQueue for the priority queue, TanStack Query for repeated request state, `type-fest` to type
  one `compact()` helper, `yoctocolors` for CLI colour. The audit's library sweep (43 candidates, ADR 005)
  also found the opposite: `proper-lockfile` was **removed** — last published 2022-06-24 — and replaced by
  an atomic `mkdir` plus a pid liveness check; `neverthrow`, `ts-pattern`, `it-pushable`, `cli-table3`,
  `picocolors`, `pino-roll` and eleven more were rejected on activity or fit, each with its figures
  recorded. Retain domain scheduling and weighted movement where generic libraries would need equally
  large adaptation code. Avoid a broad Effect/ECS/state-machine rewrite without a demonstrated benefit.
- Keep the direct Docker Engine adapter: its used API subset is small. A second abstraction or Swarm
  deployment would not remove the application's sandbox/protocol decisions. Remote/cloud execution
  needs a separate security and credential transport design.

No tests were added in the September 2026 audits at the owner's request; a test phase needs a new owner
decision. Existing checks and verification spikes may be run. Code signing/notarization, new terminal UI,
remote hosting and automatic merging are not implemented.

## Primary references

- [Bun install](https://bun.com/docs/pm/cli/install), [isolated workspaces](https://bun.com/docs/pm/isolated-installs), [secrets](https://bun.com/docs/runtime/secrets).
- [Hutch release manifest](https://hutch.blackboard.sh/hutch/releases/0.25.0/manifest.json), [Electrobun](https://github.com/blackboardsh/electrobun).
- [React](https://react.dev/reference/react), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview).
- [Pixi performance](https://pixijs.com/8.x/guides/concepts/performance-tips), [Phaser 4 releases](https://phaser.io/download/phaser4), [Tauri architecture](https://v2.tauri.app/concept/architecture/).
- [Alpine support](https://alpinelinux.org/releases/), [Docker security](https://docs.docker.com/engine/security/), [RTK](https://github.com/rtk-ai/rtk).
- [Claude model configuration](https://code.claude.com/docs/en/model-config), [Gemini lifecycle](https://ai.google.dev/gemini-api/docs/deprecations), [OpenCode models](https://opencode.ai/docs/models/), [pinned Codex ACP documentation](https://github.com/agentclientprotocol/codex-acp/blob/061f9a4a2e463a220d7a3ab2ae5e9732837085ef/README.md).
