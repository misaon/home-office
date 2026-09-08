# Home Office plan

Current status, reviewed 2026-09-08. This roadmap is separate from the
[historical implementation plan and work log](history/INITIAL-PLAN.md). Its historical checkboxes are
not evidence that every original acceptance target was achieved.

## Implemented

- Bun/TypeScript monorepo with a pure domain and simulation, SQLite event log and typed RPC/MCP.
- One repository per project/floor, a boss per floor, receptionist choreography, staff and chat.
- Docker task sessions, git-bridge publication, optional GitHub PR delivery, review and question loops.
- Claude Code plus ACP adapters for OpenCode, Gemini CLI and Codex; provider-specific images and secrets.
- React/Pixi office, board, inspector, usage/resources/settings and first-run checklist.
- Electrobun macOS arm64 packaging and unsigned release workflow.
- Independent audit repairs: serialized state changes; safe replay failure; bounded channels and runtime
  shutdown; credential/storage/HTTP hardening; task publication ordering; restart reconciliation;
  bounded renderer caches and fixed-step simulation; Sharp image pipeline; shared UI query management;
  pinned desktop/Docker dependencies; stronger lint and CI checks. Details and evidence are maintained in
  [the September audit](history/AUDIT-2026-09.md).

## Work remaining

These items are not implemented merely because an older plan described them in a completed phase.

| Priority | Work                                            | Completion evidence                                                                                                      |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| High     | Reliable source acknowledgements                | Persistent retry outbox, idempotent comments and recovery after a daemon restart                                         |
| High     | Long-term state/log retention                   | Measured replay/storage growth, snapshots or retention without losing required history, bounded host logs                |
| High     | Complete provider accounting                    | Real token/cost reporting per provider; distinguish unknown usage; explicit session/task budget semantics                |
| Medium   | Volume retention based on last use              | Recently used old volumes survive; active volumes remain protected; explicit discard behavior                            |
| Medium   | Egress policy                                   | Per-project destinations and a verified proxy/firewall boundary compatible with provider/package traffic                 |
| Medium   | Browser/native accessibility and sustained load | Representative multi-floor use, resize/keyboard flows, stable RAM/CPU over a long run                                    |
| Medium   | Missing art                                     | Delivered receptionist/character sets and missing furniture; preserve originals and verify imports against the reference |
| Later    | Remote operation                                | Authenticated TLS transport and clear host/container networking; no plaintext remote bind                                |
| Later    | Platform expansion and signing                  | Verified installer/runtime on each target, plus signing/notarization when available                                      |

Tests and code comments are not added during this audit at the owner's request. A later test phase
requires a new owner decision; existing verification scripts can still provide evidence.

## Architecture decisions

Keep React, PixiJS, Electrobun, Bun workspaces and SQLite for the present workload. Adopt focused
libraries where they remove maintained custom logic. [STACK.md](STACK.md) explains when Phaser, Tauri,
a monorepo task cache or a server database would become justified. Do not migrate solely because a tool
has a newer release or the repository has more files.

Historical owner decisions remain useful context: MIT license, default global concurrency two,
24-hour volume retention, unsigned macOS first, one floor per repository, and original sprite
preservation. Provider models and capabilities must be rechecked against current vendor documentation.

## Audit log

- 2026-09-08 — Independent audit — Incremental commits cover state/security, simulation/assets,
  lifecycle/delivery, UI/build/CI, provider/Docker repairs, integration fixes and documentation.
  Local static checks, production UI, existing ACP verification, all provider Docker builds,
  isolated browser flows and unsigned desktop packaging were exercised. See the audit report for
  evidence, unverified behavior and remaining limitations.
