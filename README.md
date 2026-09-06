# Home Office

A local multi-agent harness with a pixel-art office. AI agents (your "employees") work in isolated Docker containers on your repositories; a boss agent takes work from a chat panel or a mailbox and hands it out; you watch the team walk around, hand each other folders, drink coffee and ship branches.

- Runtime: **Bun** · Language: **TypeScript 7** · Desktop: **Electrobun** · Rendering: **PixiJS 8** · Agents: **Claude Code** (subscription) first, provider-agnostic by design · Sandboxes: **Docker** (Alpine), cloud later.
- Status: **Phase 0 (foundations and spikes) in progress** — see the Log in docs/PLAN.md.

## Documents

| File                                         | What it answers                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [docs/PLAN.md](docs/PLAN.md)                 | What we build, in which order, with acceptance criteria and a running log                        |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works: processes, interfaces, protocols, simulation, security, resource and token hygiene |
| [docs/STACK.md](docs/STACK.md)               | Which technologies and versions, why, what was rejected, sources                                 |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md)   | Coding, typing, linting, security and workflow rules                                             |

AI agents: start with `AGENTS.md`, then `docs/PLAN.md`.
