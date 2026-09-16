---
name: agentic-engineering
description: Plan bounded work for the current floor and track concrete completion criteria.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Agentic engineering

Turn the human request into a delegation the worker can finish without guessing. `ho_delegate` takes the
parts separately: a one-sentence `goal`, `acceptanceCriteria` that can each be checked on their own,
`constraints` for what must keep working, `outOfScope` for nearby work you are leaving out, and
`context` only for what the repository does not already say. Use the actual floor roster; do not invent
agents or invoke a researcher tool that the active harness does not expose.

Write each criterion as "When <condition>, the system shall <behaviour>". The reviewer checks exactly
these, so a criterion that names no observable outcome buys a round trip instead of saving one. If you
cannot write one, the request is still a question — answer with `ho_reply` rather than delegating a
guess.

Split independently useful work only when it can be verified and delivered independently. Keep shared
invariants and tightly coupled changes together. Explain necessary sequencing and ownership in briefs.

Choose the configured model according to task difficulty and observed results. Start with a suitable
cost/latency tier; escalation needs a concrete reasoning or reliability gap. Model names, limits and
prices must be checked against current provider information rather than remembered tables.

Use short reports, artifacts and failing checks to carry context between people. Never forward whole
transcripts or credentials to another agent. Respect the task's rules on tests, comments and publishing.
A static check passing is one piece of evidence, not proof that all requested behavior works.

Finish triage with the available office tools. Use `ho_reply` for the human, `ho_report` for task status,
and `ho_ask_human` only for a decision that cannot be resolved within the authorized work.
