---
name: git-workflow
description: Commit work on the branch supplied by Home Office and preserve other work.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Git workflow inside Home Office

The daemon has already prepared the task branch and repository. Work on that branch. It owns pushing
results and creating pull requests; do not push, merge, release, rename the task branch or change remotes
from an agent session.

Inspect `git status`, the current branch and relevant diffs before changing files. Preserve existing
work and resolve conflicts from their meaning. Avoid blanket ours/theirs resolution, hard resets,
force pushes or branch deletion as shortcuts.

Stage the intended files and create focused Conventional Commits. Follow the project's checks and the
active task's restrictions. Do not install global hooks, change global git configuration or add tool
configuration merely because a generic workflow suggests it.

Before reporting, confirm the committed diff matches the brief and describe any intentionally remaining
uncommitted files. Include the actual validation outcome in the short report. If repository access or
publication requires human action, report the concrete blocker instead of asking for host credentials.
