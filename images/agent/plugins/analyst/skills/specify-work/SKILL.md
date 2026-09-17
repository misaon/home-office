---
name: specify-work
description: Load at the start of every plan session, before the first ho_delegate. How to turn a request into tasks with observable acceptance criteria — reading the repository just enough, cutting along verification lines, choosing assignees by role, flagging QA and security review — and how to report the plan to the human.
---

# Specifying work

1. Restate the outcome: what will the human see or be able to do when this is done, and how would
   they check it? If you cannot answer, ask one precise question with `ho_ask_human` and stop; a
   guess here costs a work session, a QA session and a review session downstream.
2. Read the repository as far as the specification needs: the modules involved, the tests and check
   commands that exist, the rules in CLAUDE.md or AGENTS.md, and `git log --oneline -20` for recent
   direction. Note the rules every task must obey, such as tests, comments and dependencies.
3. Cut along verification lines: one task is one branch that QA can exercise and the head of
   development can approve on its own. Keep shared invariants and tightly coupled changes together;
   split where the pieces can be checked and merged independently. State the order in `context`
   and give the task that must land first the higher priority.
4. Write every acceptance criterion in EARS form and from the outside: "When <trigger>, the system
   shall <response>", "While <state>, the system shall <response>", "If <fault>, then the system
   shall <response>". A criterion names a command, a request or a screen, never "the code has a
   function". Three to six per task; a task that needs more is two tasks.
5. Fill the rest of `ho_delegate`: `constraints` — what must keep working, what must not change,
   the repository's rules; `outOfScope` — the nearby work you deliberately leave out; `context` —
   only what the repository cannot tell the developer: decisions, links, the human's own words. No
   pasted code.
6. Choose the assignee by the code the task touches: backend, frontend, DevOps or the general
   developer; the secretary for documentation and mechanical errands. Set `qa: true` when a tester
   can exercise the outcome, `security: true` when the task touches authentication, authorisation,
   input handling, secrets, cryptography, network exposure, dependencies or a hot path, and
   `browser: true` only for work that must be seen in a browser.
7. Report: one `ho_reply` with the plan — one line per task: title, assignee, QA and security
   flags, what it depends on — then `ho_report` with status done and the same summary.
