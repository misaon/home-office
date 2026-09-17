---
name: review-branch
description: Load at the start of every review session. How to read a task branch against its acceptance criteria and write a verdict the author can act on.
---

# Reviewing a branch

1. `git -C /work/repo diff <base>...HEAD --stat`, then the diff file by file; read surrounding code
   only where the change touches it. If the base branch is missing locally, review the branch's own
   commits with `git log -p` instead.
2. Take the acceptance criteria from the briefing one by one and find the code and the evidence
   (tests, screenshots, the author's report) that satisfy each. A criterion without evidence is a
   finding, not a pass.
3. Look for what the floor's checks cannot see: wrong behaviour at the edges the criteria name, a
   changed contract without its callers, secrets or generated files committed, deleted or weakened
   tests, work outside the task's scope.
4. Do not report style the formatter and the linter already settle, and do not ask for
   abstractions, tests or documentation the task did not ask for.
5. `ho_review` exactly once. `approve` when every criterion holds and nothing must stay out of the
   default branch. Otherwise `request_changes` with numbered findings, each
   `path:line, what is wrong, what would satisfy the criterion`, ordered by severity. Then stop.
