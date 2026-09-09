# ADR 007 — Would the A2A (Agent2Agent) protocol help Home Office, and do we need it?

**Status:** decided — **no adoption now.** Two future cases are named below; one of them is blocked on work
the roadmap already defers. **Confidence:** high on the verdict, medium on how valuable case 4 becomes.
**Date:** 2026-09-09. Asked by the owner after the deep audit closed, so this ADR sits beside 001–006
rather than inside a wave.

## What A2A is

An open protocol for agent-to-agent interoperability: "communication and interoperability between opaque
agentic applications", where agents "discover each other's capabilities", "securely collaborate on
long-running tasks" and "operate without exposing their internal state, memory, or tools". It is an
open-source project under the **Linux Foundation**, contributed by Google.

| Fact           | Value                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spec version   | **v1.0.1**, released 2026-05-28 (v1.0.0 on 2026-03-12, so the 1.x line is ~6 months old)                                                         |
| Repository     | `a2aproject/A2A`, Apache-2.0, 25 701 stars, last push 2026-09-04, 248 open issues                                                                |
| Core objects   | `AgentCard`, `Task`, `Message`, `Part`, `Artifact`                                                                                               |
| Task states    | `SUBMITTED`, `WORKING`, `COMPLETED`, `FAILED`, `CANCELED`, `INPUT_REQUIRED`, `REJECTED`, `AUTH_REQUIRED`                                         |
| Transports     | JSON-RPC 2.0 over HTTP, HTTP/REST, gRPC, SSE for streaming, HTTP webhooks for push                                                               |
| Auth           | Declared in the AgentCard's `securitySchemes` — OAuth2, API keys, mutual TLS, HTTP auth                                                          |
| TypeScript SDK | `@a2a-js/sdk` **1.1.0**, published 2026-08-26, **one** dependency (`jose`), 2 248 896 weekly downloads; `a2aproject/a2a-js` last push 2026-09-09 |

The SDK would pass the owner's dependency rule comfortably — that is not what decides this.

Sources, read 2026-09-09: https://github.com/a2aproject/A2A,
https://a2a-protocol.org/latest/specification/, the GitHub API for the repository and its releases, and
the npm registry for `@a2a-js/sdk`.

## Where the three protocols actually sit

- **MCP** — tools and context for _one_ agent. This is HO's `ho_report` / `ho_delegate` / `ho_reply`
  boundary and the two browser servers.
- **ACP** — an editor-to-agent session protocol, positioned as LSP was for language servers, reusing
  "the JSON representations used in MCP where possible" (agentclientprotocol.com, read 2026-09-09). This
  is how HO drives OpenCode, Gemini CLI and Codex.
- **A2A** — agent-to-agent across _trust domains_: two systems that do not share a process, a machine or
  an owner, each keeping its internals private.

The third row is the one Home Office does not currently have a problem in: the daemon **is** the
orchestrator, every agent is a container it started, and everything happens inside one machine and one
trust domain.

## The four ways it could touch Home Office

**1. Drive the providers over A2A instead of ACP — not possible today.** Claude Code, Codex and Gemini CLI
speak MCP natively (and ACP); A2A reaches them only through **third-party MCP bridges** — an MCP server
that speaks A2A on its far side. Nothing to gain: HO would add a protocol to reach the same CLIs it
already reaches directly. **Verdict: no.**

**2. Replace HO's own boss → worker delegation with A2A — actively worse.** `ho_delegate` is a domain
command: one pure decision, one event appended, one SQLite transaction, one projection update, with the
office's serialised writer behind it. A2A would put HTTP, JSON-RPC and an authentication scheme between
components that share a process, and the transactional guarantee would be gone. **Verdict: no**, and this
is the case worth refusing explicitly, because "we already have tasks and artifacts" makes it look
attractive.

**3. HO as an A2A _client_ — possible, small, and not needed yet.** An agent inside a sandbox could talk
to somebody else's A2A agent through a bridge in its MCP configuration. The only HO change is a
configuration surface: `session-run.ts:172` hardcodes `mcpServers` to `ho` plus the browser pair, so the
owner cannot add a server today. That is a contained feature (`mcp.extraServers` in `config.json`,
validated with Zod, per project or per agent). Note what it inherits: sandboxes have unrestricted egress —
an accepted risk recorded in `ARCHITECTURE.md` — so a bridge would let an agent reach an external agent
that can act on its own. **Verdict: build it when there is a concrete external agent to call, not before.**

**4. HO as an A2A _server_ — the interesting case, and the expensive one.** An external orchestrator
delegating work to a floor is a real product idea, and the domain model lines up unusually well:

| A2A                     | Home Office today                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Task` with a lifecycle | `Task` with `inbox → planned → assigned → in_progress → review → done`, plus `blocked`, `failed`, `cancelled` |
| `INPUT_REQUIRED`        | a question from an agent blocks the task until the human answers in chat                                      |
| `Artifact`              | `ho_report` artifacts: branch, PR, notes                                                                      |
| `AgentCard` skills      | roles and skill packs (`worker`, `reviewer`, `boss`, `clerk`)                                                 |
| SSE streaming           | the session event stream the UI and `ho session watch` already consume                                        |

What blocks it is not the mapping but the transport: the daemon **binds loopback only** (`127.0.0.1`,
`::1`, `localhost` — remote plaintext binding is rejected), mints one bearer token per launch, and has no
TLS or server mode. That is exactly the "remote operation" row the roadmap defers. Second obstacle:
`IntakeConnector` in `packages/core/src/ports.ts:51` is **poll + acknowledge**, so an inbound push
endpoint is not an existing extension point — either the connector shape grows, or the A2A surface lives
beside intake rather than inside it. **Verdict: only after remote operation, and then as a connector —
never by re-plumbing MCP or ACP.**

## Decision

Do not adopt A2A. Nothing in the product is waiting on it, and neither plausible use is free: case 3 needs
a configuration surface HO does not have, case 4 needs the authenticated remote transport HO has
deliberately not built.

**Cost of being wrong: low.** The task model already resembles A2A's closely enough that a later façade is
a mapping layer over the existing RPC, not a redesign — which is also the reason not to hurry: waiting
costs nothing, and the spec's 1.x line is six months old.

**Revisit when** any of these becomes true: the owner wants another system to hand work to a floor
(case 4); a specific external A2A agent is worth calling from a session (case 3); or a provider HO runs
gains native A2A support, at which point the comparison is with ACP rather than with nothing.
