# Home Office

A local multi-agent harness with a pixel-art office. AI agents (your "employees") work in isolated Docker containers on your repositories; a boss agent takes work from a chat panel or a mailbox and hands it out; you watch the team walk around, hand each other folders, drink coffee and ship branches.

- Runtime: **Bun** · Language: **TypeScript 7** · Desktop: **Electrobun** · Rendering: **PixiJS 8** · Agents: **Claude Code** (subscription) first, provider-agnostic by design · Sandboxes: **Docker** (Alpine), cloud later.
- Status: **Phases 0–7 complete**: the boss triages chat messages and delegates over MCP tools, workers and reviewers run in sandboxes with a review loop, handoffs, human questions and resumed conversations; branches or pull requests are delivered to local and git-URL projects; the pixel-art office shows agents walking, working, handing over and idling, with chat, board, inspector, usage, resources and settings panels; the **desktop app** (Electrobun, unsigned macOS build from GitHub Releases) runs the daemon in-process and opens with a first-run checklist; **GitHub issues** of a project become mail the postman brings to the boss, with comments back on the issue; agents can run on **Claude Code, OpenCode, Gemini CLI or Codex** (ACP), with subscription or API-key auth and per-provider sandbox images. Next: Phase 8 (hardening, observability, tests). See the Log in docs/PLAN.md.

## Run it

- Desktop (development): `bun install`, install Hutch (`curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh`), then `bun run desktop:dev`. `bun run desktop:build` produces the unsigned `.dmg` in `apps/desktop/artifacts/`.
- Headless / browser: `bun run ui:build`, `ho daemon --ui`, then `ho ui` opens the office in a browser (same UI, same daemon).
- First launch: the setup checklist checks Docker, builds the agent image, takes your `claude setup-token`, hires the default team and says hello to the boss.

## Documents

| File                                         | What it answers                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [docs/PLAN.md](docs/PLAN.md)                 | What we build, in which order, with acceptance criteria and a running log                        |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works: processes, interfaces, protocols, simulation, security, resource and token hygiene |
| [docs/STACK.md](docs/STACK.md)               | Which technologies and versions, why, what was rejected, sources                                 |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md)   | Coding, typing, linting, security and workflow rules                                             |

AI agents: start with `AGENTS.md`, then `docs/PLAN.md`.
