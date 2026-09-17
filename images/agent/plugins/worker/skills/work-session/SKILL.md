---
name: work-session
description: Load at the start of every work session and again before ho_report. The order of work in a Home Office sandbox, from recovering context and setting up the repository through committing at checkpoints and running the floor's check the way the office re-runs it, to the report.
---

# A work session

1. Recover context. `git -C /work/repo status --short` and `git log --oneline -5` show what earlier
   sessions left behind; when the briefing mentions notes or check output you have not seen, call
   `ho_task_status`.
2. Set up once per task, inside /work/repo: install dependencies with the repository's own package
   manager. Caches live in /work/.cache and survive between your sessions; your home directory is
   read-only, so anything that insists on writing there needs a path under /work or /tmp instead.
3. Work in small steps and commit each one that leaves the repository consistent, with a
   Conventional Commit message. An uncommitted change is lost when the turn or time budget ends; a
   committed one is pushed by the office even then.
4. Before you report, run the floor's check command exactly as given. The office re-runs it in a
   container with no network and an empty home directory, so a check that downloads something or
   needs a global tool fails there even if it passed for you; keep everything it needs under
   /work/repo.
5. Read the check's exit code, not its last lines. Fix, commit, run it again. Never delete or weaken
   a test or a check to make it pass; if a check is wrong, say so in the report.
6. `ho_report` with status review: what changed, how you verified it, what stays open. The text
   becomes the pull-request description. Then stop.
