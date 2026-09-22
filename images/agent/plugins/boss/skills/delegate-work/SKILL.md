---
name: delegate-work
description: Load before the first ho_delegate or ho_plan of a triage session, and whenever a request looks bigger than one task. How to route a request — an errand to the secretary, an obvious change to the developer whose role fits, everything else to the analyst — how to fill the ho_delegate fields when specifying the work yourself, and how to report.
---

# Routing and delegating work

1. Read the request twice: what outcome does the human want, and how would they check it? If you
   cannot answer the second question, ask one precise question with `ho_reply` and stop; a guess
   costs several sessions downstream.
2. Route by size and certainty:
   - An errand — documentation, a changelog entry, a rename, a dependency bump, a one-line fix —
     goes to the secretary with `ho_delegate`. `qa: false`; `security: true` only for a dependency
     bump.
   - An obvious single change whose three to six acceptance criteria you can write in a minute goes
     to the developer whose role fits (backend, frontend, DevOps, developer) with `ho_delegate`.
   - Everything else — several tasks, criteria you cannot write without reading the code, a design
     decision, code you do not know — goes to the analyst with `ho_plan`: the request verbatim plus
     what the human clarified, in `brief`, and the decisions already made in `context`. Do not
     pre-split it; the analyst reads the repository and creates the tasks.
3. When you specify a task yourself, fill `ho_delegate` as the specification it is:
   - `goal`: one sentence, the outcome and for whom.
   - `acceptanceCriteria`: each "When <condition>, the system shall <behaviour>", observable
     without reading the code. Three to six is normal; more means the task is too big.
   - `constraints`: what must keep working or must not change, including the repository's own rules
     on tests, comments and dependencies.
   - `outOfScope`: nearby work you are deliberately leaving out, so the developer does not drift.
   - `context`: only what the repository cannot tell: decisions already made, links, prior art. No
     pasted code.
   - `shape`: `mechanical` for a rename, a copy or link change, a dependency bump, a one-line fix;
     `routine` for an ordinary change with logic or layout to get right; `risky` for
     authentication, payments, data migrations, public APIs, anything hard to reverse. The office
     sizes budgets, effort and review depth by it and raises it when the diff turns out larger.
   - `qa: true` when a tester can exercise the result (user-visible behaviour, an API or data
     change); `security: true` when the change touches authentication, authorisation, input
     handling, secrets, cryptography, network exposure, dependencies or a hot path. The head of
     development reviews every task last regardless.
   - `browser: true` only when the result has to be looked at in a browser; `publish` only when the
     human asked for a pull request, or explicitly for none.
4. Pick the assignee by fit, then by cost; your own name only when nobody fits. `ho_hire` only for
   a gap that will come back.
5. `ho_report` with status done and a one-line summary. The office announces every handover in the
   chat itself, with the assignee and the reviewers, so do not repeat it; `ho_reply` is for a
   question back or a decision the human needs to know.
6. When the human writes while a task of this conversation is in flight, `ho_steer` passes the
   instruction into that colleague's running session; confirm with `ho_reply` what you passed on
   and to whom. A message that changes what the task is for is a new task, not a steer.
