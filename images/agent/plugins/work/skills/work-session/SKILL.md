---
name: work-session
description: Load at the start of every work session and again before ho_report. The order of work in a Home Office sandbox, from recovering context and setting up the repository through committing at checkpoints and running the floor's check the way the office re-runs it, to updating whatever documentation the change made untrue and a report written for the reviewers who read the branch next.
---

# A work session

1. Recover context. `git -C /work/repo status --short` and `git log --oneline -5` show what earlier
   sessions left behind; when the briefing mentions notes or check output you have not seen, call
   `ho_task_status`.
2. Set up once per task, inside /work/repo: install dependencies with the repository's own package
   manager. Caches live in /work/.cache and survive between your sessions; your home directory is
   read-only, so anything that insists on writing there needs a path under /work or /tmp instead.
3. Load the skill for the kind of change in front of you when your pack has one (backend-change,
   frontend-change, devops-change, general-change, small-errand); it names what the reviewers of that kind of change
   look for.
4. Work in small steps and commit each one that leaves the repository consistent, with a
   Conventional Commit message. An uncommitted change is lost when the turn or time budget ends; a
   committed one is pushed by the office even then. The office verifies and publishes exactly the
   commit at HEAD, and only from a clean tree: a file left modified or untracked when you report
   comes back to you as a failed check, so `git status --short` must be empty before `ho_report`.
5. Before you report, run the floor's check command exactly as given. The office re-runs it in a
   container with no network and an empty home directory, so a check that downloads something or
   needs a global tool fails there even if it passed for you; keep everything it needs under
   /work/repo. When the floor has no check command, run only what the package you changed already
   defines and stop there: no tour of the repository's tooling, no attempt to run an application
   whose services you do not have.
6. Read the check's exit code, not its last lines: run it plainly, without `| tail` or `| head`,
   or prefix `set -o pipefail;` when you must trim the output, so that a failure reaches you as a
   non-zero exit. Never wait with `sleep`: a background command tells you when it completes, and a
   port is watched with a bounded `curl` loop. Fix, commit, run it again. Never delete or weaken a
   test or a check to make it pass; if a check is wrong, say so in the report.
7. Check what the change made untrue before you report it: the README, whatever the repository keeps
   as documentation, and the help text of any command you altered. A change to what someone
   installs, runs, configures or calls ships with the documentation for it in the same commit. The
   head of development reviews this, and a finding at that gate sends the branch back through the
   whole review chain — so it is much cheaper to find here.
8. `ho_report` with status review. The briefing names who reviews the commit next (QA, the security
   engineer, the head of development), each in their own copy of the repository; write for them:
   what changed and why, how to run it, how you verified each acceptance criterion, what
   documentation you updated or why none needed it, and what stays open. The text also becomes the
   pull-request description. When the session had browser tools and the change is visible, name
   the screenshots you copied into /out/chat in `files`; the human sees them in the chat. Then stop.
