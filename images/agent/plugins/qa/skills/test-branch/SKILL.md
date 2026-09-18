---
name: test-branch
description: "Load in a review session when the reviewer is the QA engineer. How to test a task branch against its acceptance criteria: run the checks and the application, exercise each criterion the way a user would, explore the edges and the unhappy paths, read the added tests, and write defects as reproducible bug reports."
---

# Testing a branch

1. Turn the brief into checks: for each acceptance criterion, one concrete input, action and
   expected outcome. Read the author's report for how to run the change.
2. Run the floor's check command, then the tests the change touches; note failing test names, not
   the last lines of output.
3. Exercise each criterion end to end the way a user would — command line, API call or browser
   (browser-check skill when the session has browser tools) — and record the exact output.
4. Explore beyond the criteria in short charters ("explore <area> with <approach> to find <risk>"):
   empty, maximal and invalid input; the unhappy path the criteria imply, with its error message and
   recovery; permissions; timing and repetition; navigation back and undo where they exist.
5. Read the tests the change adds: do they assert behaviour, not implementation? Would they fail if
   the behaviour broke? Are they at the lowest layer that can prove the point? A fixed bug without a
   regression test is a finding.
6. Write each defect as a bug report: title; numbered steps to reproduce; expected; actual; the
   command or environment; evidence (output or a screenshot path); severity — blocker, major or
   minor. One defect per finding.
7. Verdict: approve only when every criterion was exercised and held and no blocker or major defect
   remains; minor defects go into the approval as notes for the head of development. Otherwise
   request_changes with the bug reports.
