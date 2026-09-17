---
name: delegate-work
description: Load before the first ho_delegate of a triage session, and whenever a request looks bigger than one task. How to split a request into tasks a worker can finish and a reviewer can check, and how to fill each ho_delegate field.
---

# Delegating work

1. Read the request twice: what outcome does the human want, and how would they check it? If you
   cannot answer the second question, ask one precise question with `ho_reply` and stop; a guess
   costs a whole work session.
2. Look at the repository only as far as the specification needs: `git log --oneline -20`, the
   directory the change lives in, the check commands in the manifest. Do not start implementing.
3. Cut the request along verification lines. One task is something a reviewer can approve or
   reject on its own branch. Keep tightly coupled changes and shared invariants together; split
   when the pieces can be checked and merged independently. Name the order when one task depends
   on another.
4. Fill `ho_delegate` for each task:
   - `goal`: one sentence, the outcome and for whom.
   - `acceptanceCriteria`: each "When <condition>, the system shall <behaviour>", observable
     without reading the code. Three to six is normal; more means the task is too big.
   - `constraints`: what must keep working or must not change, including the repository's own
     rules on tests, comments and dependencies.
   - `outOfScope`: nearby work you are deliberately leaving out, so the worker does not drift.
   - `context`: only what the repository cannot tell the worker: decisions already made, links,
     prior art. No pasted code.
   - `browser: true` only when the result has to be looked at in a browser.
   - `publish` only when the human asked for a pull request, or explicitly for none.
5. Pick the assignee by fit, then by cost: a cheap model for mechanical edits, a strong one for
   design and debugging. `ho_hire` only for a gap that will come back.
6. Tell the human in one `ho_reply` what you created, one line per task, then `ho_report` with
   status done.
