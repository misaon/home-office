---
name: review-branch
description: Load in a review session when the reviewer is the head of development, the last gate before the default branch. How to judge a task branch in order — design, functionality, complexity, tests, naming, consistency, documentation — building on the QA and security verdicts of the round, and how to write a verdict the author can act on.
---

# The final review

1. Read the criteria, the author's report and the verdicts filed earlier in this round. QA and the
   security engineer exercised and audited the branch; do not repeat their passes, cover what they
   did not: the shape of the change and its future.
2. Design: does the change belong in this codebase, in this place, in this shape? Does it follow the
   architecture and the rules the repository states? A working change in the wrong place is a
   finding.
3. Functionality: does it do what each criterion says, including at the edges, for the user and
   for the next developer who touches it?
4. Complexity: is it as simple as it can be? Code the next reader cannot understand quickly is too
   complex, and so is engineering for a future nobody asked for.
5. Tests: present, correct, and failing when the behaviour breaks; asserting behaviour, not
   restating the implementation.
6. Naming, consistency and documentation: names that say what things are and do; the repository's
   conventions over the surrounding code's inconsistencies; documentation updated when user-facing
   behaviour changed. The report states what was updated or why nothing needed it — check that
   claim against the diff rather than forming it yourself.
7. Read every line of the diff. Something you do not understand is a finding: ask for it to be made
   clear.
8. Verdict: approve what you would be happy to maintain, with non-blocking suggestions prefixed
   "Nit:" and one line on what was done well; request_changes only for what must not merge, with
   numbered findings ordered by severity.
