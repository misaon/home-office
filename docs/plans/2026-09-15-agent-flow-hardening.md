# Hardening the agent flow against the 2026 harness literature

Owner request, 2026-09-15: read the current research on agent harnesses and multi-agent orchestration,
compare it against what Home Office actually does, and pay down the technical debt in the flow —
agent-to-agent communication, protocols, base prompts, skills, everything the research touches.

This plan is the result of that reading. It states what the sources say, what this repository does
today, and which of the two has to move.

## What the sources say

Read 2026-09-15. Primary sources first; a secondary source is marked as such.

### 1. Long horizons fail by step count, not by context length

[How Fast Do Agents Rot?](https://arxiv.org/abs/2609.01660) (arXiv 2609.01660) measured nine models
from 1.2 B to 671 B parameters across four task families and five horizon lengths, 10 664 trajectories.
Two findings matter here:

- On agentic tasks, "every model tested, including widely deployed systems, falls from near-perfect
  success to near zero within sixteen steps".
- Degradation "is driven by step count rather than context length: bounding the context window steepens
  decay rather than easing it (logit slope -0.69 vs. -0.44)".

The second half is the part that changes design: truncating context inside a run makes things worse.
A **fresh context window that starts from a structured artifact** is a different thing from a truncated
one, and it is the mitigation the harness literature converged on.

The reliability gap between benchmark-length and production-length horizons was 0.42 → 0.24.

Supporting, secondary: [context rot](https://www.tinyfish.ai/blog/context-rot) summarises Chroma's
finding that all 18 frontier models tested degrade as input length grows, with the U-shaped
"lost in the middle" position effect.

### 2. Multi-agent failures are architectural

[Why Do Multi-Agent LLM Systems Fail?](https://www.alphaxiv.org/abs/2503.13657) (MAST, NeurIPS 2025)
annotated 1 600+ traces across seven frameworks (inter-annotator κ = 0.88) and produced 14 failure
modes in three groups:

| Group                    | Share  | Worst modes                                                                                         |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| System design            | 44.2 % | step repetition 15.7 %, unaware of termination conditions 12.4 %, disobey task specification 11.8 % |
| Inter-agent misalignment | 32.3 % | reasoning–action mismatch 13.2 %, task derailment 7.4 %, fail to ask for clarification 6.8 %        |
| Task verification        | 23.5 % | incorrect verification 9.1 %, no or incomplete verification 8.2 %, premature termination 6.2 %      |

The intervention study is the reason this plan changes mechanisms rather than wording: refined prompts
and adjusted topologies moved success by only **+9.4 % to +15.6 %**, and the authors concluded that
"superficial fixes are insufficient for achieving robust reliability".

### 3. Structured handoff artifacts beat compaction

[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
(Anthropic) frames the problem as "a software project staffed by engineers working in shifts, where each
new engineer arrives with no memory of what happened on the previous shift". Their harness carries state
in files, not in context:

- a structured feature list in **JSON**, because "the model is less likely to inappropriately change or
  overwrite JSON files compared to Markdown files";
- a progress log;
- an `init.sh` that starts the app and runs a basic end-to-end check, so the agent "doesn't have to
  figure out how to test the code";
- git history, which lets a bad shift be reverted.

Every session runs the same opening ritual: confirm the working directory, read git log and progress,
pick one incomplete item, start the app, verify it still works, do one item, commit, update progress.
The four failure modes they name — premature project completion, undocumented progress, premature
feature marking, runtime uncertainty — map one-to-one onto those artifacts.

[The three-agent evolution](https://www.infoq.com/news/2026/04/anthropic-three-agent-harness-ai/)
(InfoQ, April 2026, secondary) separates planner, generator and evaluator because "agents often overrate
their results, particularly on subjective tasks", and uses "context resets alongside structured handoff
artifacts" rather than preserving full context. Reported: 5–15 iterations per run, sessions up to four
hours.

### 4. Context engineering: the smallest high-signal set

[Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
(Anthropic). The operative rules for us:

- Aim for "the smallest possible set of high-signal tokens that maximize the likelihood of some desired
  outcome", and for the system prompt, "the minimal set of information that fully outlines your expected
  behavior" at the right altitude — neither hardcoded logic nor vague encouragement.
- Bloated tool sets are a named failure mode: "if a human engineer can't definitively say which tool
  should be used in a given situation, an AI agent can't be expected to do better".
- Prefer a hybrid of pre-loaded context and just-in-time retrieval; Claude Code itself pre-loads
  `CLAUDE.md` and retrieves the rest through glob and grep.
- Sub-agents should return "a condensed, distilled summary of its work (often 1,000-2,000 tokens)".

[Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
adds namespacing, default result limits, pagination, and error messages that steer the agent toward a
better call.

### 5. Skills are an open standard now, and we only use half of it

[agentskills.io/specification](https://agentskills.io/specification) is the published format: a skill is
a directory with `SKILL.md`, YAML frontmatter with required `name` (≤ 64 chars, lowercase, hyphens, must
match the directory name) and `description` (≤ 1024 chars), optional `license`, `compatibility`,
`metadata`, experimental `allowed-tools`, plus optional `scripts/`, `references/`, `assets/`.
Progressive disclosure is defined in three stages: **metadata ≈ 100 tokens loaded for all skills at
startup → the `SKILL.md` body (recommended < 5 000 tokens, keep under 500 lines) on activation →
bundled files only when required**.

Secondary reporting says the standard is implemented by Claude Code, Cursor, Codex, Gemini CLI and
GitHub Copilot ([QASkills](https://qaskills.sh/blog/agent-skills-open-standard-portability)), and that
[Agent Plugins 1.0](https://www.digitalapplied.com/blog/agent-plugins-1-0-open-standard-portable-ai-skills)
was published 2026-08-06 as a vendor-neutral `plugin.json` + `skills/` + `mcp.json` directory with a
five-person technical steering committee (Amazon, Cursor, Microsoft, OpenAI, Vercel).

The pattern for serving skills over MCP — `list_skills`, `get_skill`, `get_skill_file` — is described by
[Developers Digest](https://www.developersdigest.tech/blog/skills-over-mcp-progressive-disclosure)
(secondary): "any compliant client discovers and calls tools the same way, so a skill directory exposed
as `list_skills`, `get_skill`, and `get_skill_file` works from any MCP-capable harness."

### 6. MCP is stateless as of 2026-07-28

[The 2026-07-28 specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/) removed the
`initialize`/`initialized` handshake and the `Mcp-Session-Id` header, added Multi Round-Trip Requests
(`resultType: "input_required"` for mid-call user input), `Mcp-Method`/`Mcp-Name` routing headers,
`ttlMs`/`cacheScope` on list results, authorization hardening (RFC 9207 `iss` validation, CIMD over
DCR), and an extensions framework. Roots, sampling, logging and the legacy HTTP+SSE transport are
deprecated with a twelve-month minimum support window.

### 7. Verification wants a verifiable reward, not a score

Secondary but consistent across sources: [LLM-as-a-judge in 2026](https://futureagi.com/blog/llm-as-a-judge/)
reports that raw judge scores drift and must not be compared across time without calibration, that
"binary or low-precision scoring produces more reliable results than high-precision numerical scales",
and that in agentic coding the split is **verifiable rewards (tests) answer "did it work", rubrics
answer "is it readable, efficient, secure"**.

### 8. Cost

Anthropic's multi-agent research system reported ~**15× the tokens** of a chat interaction, with token
usage explaining 80 % of performance variance
([ZenML LLMOps database](https://www.zenml.io/llmops-database/building-production-multi-agent-research-systems-with-claude),
secondary summary of Anthropic's own post). Home Office's chain is triage → delegate → work → review,
so every human sentence can become three or four sessions. Budgets exist per agent; nothing caps a
task across its sessions.

### 9. Security

The lethal trifecta — private data, untrusted content, exfiltration — is unchanged as the governing
model ([Sophos](https://www.sophos.com/en-us/blog/inside-the-lethal-trifecta-blast-radius-reduction-in-ai-agent-deployments),
secondary). Two 2026 CVEs are worth knowing because they are this shape: CVE-2026-22708 (Cursor) poisoned
the agent's execution environment so that allowlisted commands carried payloads, and CVE-2025-59532
(Codex CLI) let the agent's own output redefine its sandbox boundary. Human red-teamers reached a 100 %
bypass rate against twelve theoretical prompt-injection defences, so the workable answer is architectural
containment, not detection.

## What Home Office does today

| Concern                | Today                                                                               | Where                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Turn budget            | `maxTurnsPerTask` default 60, passed as `--max-turns`                               | `packages/daemon/src/session-run.ts`                                                |
| Turn exhaustion        | Detected as `error_max_turns` → `{kind:"error",code:"max_turns"}`                   | `packages/runtime-claude-code/src/stream-json.ts`                                   |
| State between sessions | Task notes in the event log; the opening message lists notes since the last session | `packages/daemon/src/prompts.ts`                                                    |
| Verification           | `ho_report` takes a free-text summary and is believed                               | `packages/daemon/src/mcp-tools.ts`                                                  |
| Review                 | Optional; `findings` is free text up to 4 000 chars; `maxReviewRounds` default 2    | `packages/protocol/src/mcp.ts`, `packages/core/src/commands/review.ts`              |
| Brief                  | One free-text blob up to 8 000 chars                                                | `packages/protocol/src/mcp.ts`                                                      |
| Skills                 | `--plugin-dir` for Claude Code only; the ACP runtime reports `plugins: []`          | `packages/runtime-claude-code/src/command.ts`, `packages/runtime-acp/src/prompt.ts` |
| MCP transport          | One server per request, `enableJsonResponse`, bearer token per session              | `packages/daemon/src/mcp.ts`                                                        |
| Task volume            | `/work` persists across sessions; `/work/repo` is the checkout                      | `packages/daemon/src/git-bridge.ts`                                                 |
| Observability          | Domain events + a live runtime stream; no traces, no evals                          | —                                                                                   |

Two things are already right and should not be "fixed": the MCP gateway is effectively stateless, which
is where the 2026-07-28 spec went; and tools are namespaced `ho_*`, which is what the tool-design
guidance asks for.

One gap is unambiguous and was confirmed by reading both runtimes: **an agent on OpenCode, Gemini CLI or
Codex receives no skills at all.** The skill pack reaches Claude Code through `--plugin-dir` and reaches
nobody else.

## Owner decisions, 2026-09-15

Four questions were put to the owner with the evidence above. All four were answered with the
recommended option:

1. **A hard verification gate**, configured per repository in `.ho/config.json`.
2. **Skills served over Home Office's own MCP server**, so every runtime gets them.
3. **A structured brief** with explicit acceptance criteria.
4. **Short sessions with a progress artifact and automatic resume.**

## What changes

### Phase 1 — the verification gate

`.ho/config.json` gains `verify`:

```jsonc
{ "verify": { "command": "bun run check", "timeoutSeconds": 900 } }
```

After a work session calls `ho_report(status: "review")`, and before the daemon publishes anything, the
daemon runs that command **inside the task's own sandbox** — never on the host. A non-zero exit does not
complete the task: the output (bounded, tail-kept) is appended as a task note and the session resumes
with it, up to a bounded number of attempts; then the task blocks for the human.

Security note, because `.ho/` is agent-writable by the owner's own decision
([the accepted risk](../ARCHITECTURE.md#the-accepted-risk)): the verify command is repository-supplied
code executed in the sandbox that already runs repository-supplied code. It must never gain a host
execution path. This is the single most important invariant of the phase.

Done when: a task whose checks fail cannot reach `done`, the failing output is visible on the task, and
a floor with no `verify` behaves exactly as it does today.

**Verified 2026-09-15**, `recordVerificationFailure` driven against an in-memory model with
`maxAttempts: 2`, output as printed:

```
attempt 1: status=assigned notes=1 lastNoteStartsWithMarker=true
attempt 2: status=blocked notes=2 lastNoteStartsWithMarker=true
exported verify: {"command":"bun run check","timeoutSeconds":900,"maxAttempts":2}
round-trips through the schema: true
```

Not verified: the container run itself. `runVerify` builds a one-shot sandbox spec from the agent image
and typechecks, but proving it end to end needs Docker, a built agent image and a provider token, so it
is exercised the first time a real floor sets `verify`.

### Phase 2 — structured briefs

`HoDelegateInput.brief` splits:

```ts
{
  goal: string,                   // one sentence
  acceptanceCriteria: string[],   // "When <condition>, the system shall <behaviour>"
  constraints: string[],
  outOfScope: string[],
  verify: string[],               // commands that must pass
}
```

The EARS-shaped criteria are what spec-driven development settled on, and they give the reviewer a
checklist instead of a vibe. `Task` keeps a rendered `brief` for display and the structure beside it, so
nothing in the UI or the event log breaks. The boss's triage prompt and the `agentic-engineering` skill
change together.

Done when: the boss cannot delegate without at least one acceptance criterion, the criteria show as a
checklist on the task, and old tasks still render.

**Verified 2026-09-15**, `delegateTask` driven against an in-memory model. The rendered brief came back
as goal, then `Acceptance criteria:`, `Constraints:`, `Out of scope:` and `Context:` as bullet sections;
`task.spec` kept the same four fields as data; and `HoDelegateInput.safeParse` with an empty
`acceptanceCriteria` was rejected. A task a human typed keeps `spec: undefined` and renders as before.

### Phase 3 — skills over MCP

Three tools on the office's own MCP server, mirroring the disk layout:

- `ho_list_skills` → `[{ name, description }]` for the agent's pack (~100 tokens per skill)
- `ho_get_skill(name)` → the `SKILL.md` body plus a manifest of bundled files
- `ho_get_skill_file(name, path)` → one bundled file

Claude Code keeps `--plugin-dir` (its loader is better than a tool call); every other runtime gets the
same skills through MCP, and the system prompt tells them the index exists. The packs are validated
against the published spec (`name` matching the directory, ≤ 64 chars; `description` ≤ 1024; body under
500 lines) in `bun run check`.

Done when: an OpenCode or Codex session can list and read the same skills a Claude Code session gets,
and a malformed `SKILL.md` fails the repository's own check.

**Verified 2026-09-15**, `SkillLibrary` driven against the shipped packs:

```
boss: agentic-engineering, context-budget, search-first
worker: bun-runtime, coding-standards, error-handling, git-workflow, verification-loop
reviewer: coding-standards, security-review, verification-loop
none: (none)
worker index size: 459 chars
worker all bodies: 5889 chars
escape "../../../etc/passwd" -> no file "../../../etc/passwd" in skill "bun-runtime"
escape "/etc/passwd" -> no file "/etc/passwd" in skill "bun-runtime"
escape "references/../../SKILL.md" -> no file "references/../../SKILL.md" in skill "bun-runtime"
escape "notadir/x.md" -> no file "notadir/x.md" in skill "bun-runtime"
unknown skill -> no skill "nope" in this session
```

So the index a session pays for at discovery is **459 characters against 5 889** of full bodies for the
worker pack — measured in characters, not tokens, because nothing here tokenised them. `bun run
skills:check` validated all eleven shipped skills against the published format.

Not verified: a real OpenCode or Codex session calling the tools, which needs those providers'
credentials. The tools are provider-agnostic MCP, and the runtimes are MCP clients, but that is an
argument rather than a measurement.

### Phase 4 — horizon and the progress artifact

- The agent writes `/work/state/progress.md` and `/work/state/plan.json` — outside `/work/repo`, so they
  are never committed. `plan.json` carries the acceptance criteria from phase 2 with a pass/fail flag
  each, which is the feature-list pattern in the shape our own briefs already have.
- Every work session opens with the same ritual: read git log, read `progress.md` and `plan.json`, run
  the verify command to learn whether the previous shift left the branch working, then take the highest
  priority unmet criterion.
- `error_max_turns` stops being a failure. It becomes: commit, write the artifact, end the session, and
  let the scheduler start a fresh one.
- The default `maxTurnsPerTask` drops from 60.

**The new default is a judgement call, not a measurement, and is labelled as such.** The sixteen-step
figure is from the paper's task families, and a Claude Code "turn" is not the same unit as that paper's
"step" — a turn can carry several tool calls. Phase 6 is what replaces the guess with a number from our
own tasks. Until then the plan proposes 25 and says openly that it is an estimate.

Done when: a session that exhausts its turns continues in a new one without human input, the artifact
survives between them, and no task loses committed work to a turn limit.

### Phase 5 — the review rubric

`HoReviewInput` becomes a small JSON verdict: per-criterion pass/fail against the brief's acceptance
criteria, plus findings with `file:line`, plus one overall binary verdict. Low-precision scoring is
deliberate — the research is consistent that fine-grained numeric scales from a judge do not hold
calibration. Review stops being optional when a floor has a reviewer.

Done when: a reviewer's verdict names each acceptance criterion, and `request_changes` returns a
checklist rather than prose.

### Phase 6 — the eval harness

A small set of golden tasks in this repository, run against a real daemon, measuring success by horizon
length. This is what turns phase 4's 25 into a measured number and what makes any later prompt change
provable rather than plausible. Anthropic's tool guidance makes the same point: evaluation-driven, not
first-try.

Done when: `bun run eval` reports a success rate per task and per horizon, and the number in phase 4 is
replaced by a measured one with its command and output recorded.

### Phase 7 — documentation

`ARCHITECTURE.md` gains a flow section describing the verification gate, the artifacts and the session
ritual; `CONVENTIONS.md` gains the rule that agent-facing numbers are measured; `STACK.md` records the
decisions here. This plan stays as the record of what the sources said on 2026-09-15.

## Deliberately not doing now

- **OpenTelemetry GenAI tracing.** The conventions define `create_agent`, `invoke_agent`, `plan`,
  `invoke_workflow` and `execute_tool` spans, but every one of them is still marked "Development"
  ([OpenTelemetry](https://opentelemetry.io/blog/2026/genai-observability/)). Adopting an unstable
  convention now buys churn. Revisit when they stabilise.
- **MCP Multi Round-Trip Requests for `ho_ask_human`.** MRTR is the protocol-native way to ask a user
  mid-call, and `ho_ask_human` is our bespoke version of it. Ours works, is event-sourced and survives a
  daemon restart, which MRTR's retry model does not obviously improve on. Worth revisiting when the
  TypeScript SDK's MRTR support is exercised by a client we actually use.
- **A2A.** Agents here never address each other directly: they hand work to the daemon, which schedules
  the next session. That is a deliberate property — it is what makes every exchange an event in the log —
  and A2A would replace it with peer messaging we would then have to make observable again.
- **Agent Plugins 1.0 repackaging.** The format is right, but we have not measured whether the ACP
  providers we ship actually load it at the versions we pin. Phase 3 does not depend on it.

## Sources

Primary:

- [Effective harnesses for long-running agents — Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), read 2026-09-15
- [Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), read 2026-09-15
- [Writing effective tools for AI agents — Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents), read 2026-09-15
- [Agent Skills specification — agentskills.io](https://agentskills.io/specification), read 2026-09-15
- [The 2026-07-28 MCP specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/), read 2026-09-15
- [How Fast Do Agents Rot? — arXiv 2609.01660](https://arxiv.org/abs/2609.01660), read 2026-09-15
- [Why Do Multi-Agent LLM Systems Fail? — arXiv 2503.13657 (MAST)](https://www.alphaxiv.org/abs/2503.13657), read 2026-09-15
- [Agent Client Protocol — Zed](https://zed.dev/acp), read 2026-09-15
- [GenAI observability — OpenTelemetry](https://opentelemetry.io/blog/2026/genai-observability/), read 2026-09-15

Secondary, used for dates and adoption claims and marked as such above:

- [Anthropic designs three-agent harness — InfoQ, April 2026](https://www.infoq.com/news/2026/04/anthropic-three-agent-harness-ai/)
- [Agent Plugins 1.0 — digitalapplied](https://www.digitalapplied.com/blog/agent-plugins-1-0-open-standard-portable-ai-skills)
- [Agent Skills open standard portability — QASkills](https://qaskills.sh/blog/agent-skills-open-standard-portability)
- [Skills delivered over MCP — Developers Digest](https://www.developersdigest.tech/blog/skills-over-mcp-progressive-disclosure)
- [LLM-as-a-judge in 2026 — Future AGI](https://futureagi.com/blog/llm-as-a-judge/)
- [Building production multi-agent research systems — ZenML LLMOps database](https://www.zenml.io/llmops-database/building-production-multi-agent-research-systems-with-claude)
- [Inside the lethal trifecta — Sophos](https://www.sophos.com/en-us/blog/inside-the-lethal-trifecta-blast-radius-reduction-in-ai-agent-deployments)
- [Context rot — TinyFish](https://www.tinyfish.ai/blog/context-rot)
- [A survey of agent interoperability protocols — arXiv 2505.02279](https://arxiv.org/html/2505.02279v1)
