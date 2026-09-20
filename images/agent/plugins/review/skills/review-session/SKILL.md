---
name: review-session
description: "Load at the start of every review session, before the skill of your role. The mechanics of reviewing a task's verified commit in a Home Office sandbox: reading the diff against the base branch in your own copy of the repository, collecting evidence per acceptance criterion, running what needs running, and filing exactly one ho_review verdict the author can act on."
---

# A review session

1. You review one commit, named in your briefing, checked out in a copy of the repository that is
   yours alone. The office recorded that commit when the author reported and it is the only thing
   that gets published; nothing you change in /work/repo reaches it, so a fix you want is a finding,
   never an edit.
2. Diff first: `git -C /work/repo diff <base>...HEAD --stat`, then the diff file by file; read
   surrounding code only where the change touches it. If the base branch is missing locally, review
   the branch's own commits with `git log -p`. Read the acceptance criteria and the author's report
   before the code; the report says how to run things.
3. When the briefing says you reviewed this branch before, it names the commit you judged then. The
   commits you have not read are exactly `git -C /work/repo log --oneline <that commit>..HEAD`; a
   commit's timestamp is not evidence of anything, so never select by time. Read those commits in
   full and check that the findings which sent the branch back are addressed, whoever filed them. If
   the briefing carries no earlier commit, treat the whole diff as new. Say in the verdict which
   commits you read.
4. Set up only what you need to exercise the change: dependencies with the repository's own package
   manager, into /work; caches survive between reviews of this task. You can run commands, tests and
   the application. If the briefing says the floor runs no automatic checks, running the
   repository's own tests is part of your job, not optional.
5. Then load the skill of your role — test-branch for QA, audit-branch for the security engineer,
   review-branch for the head of development — for what to look for. This skill is only the
   mechanics.
6. Evidence per criterion: for each acceptance criterion, note the code and the evidence (a test you
   ran, a command's output, a screenshot) that satisfies it. A criterion without evidence is a
   finding, not a pass.
7. Findings: numbered, ordered by severity, each `path:line — what is wrong — what would satisfy
the criterion`; for behaviour, steps to reproduce, expected and actual. Style the formatter and
   the linter already settle is not a finding, and neither is work the task did not ask for.
8. `ho_review` exactly once. `approve` when every criterion holds and nothing must stay out of the
   default branch; the commit then moves to the next reviewer in the chain, or closes when you are
   the last. `request_changes` sends it back to the author and the chain starts again from the
   first reviewer, so put every finding into the one verdict. Then stop.
