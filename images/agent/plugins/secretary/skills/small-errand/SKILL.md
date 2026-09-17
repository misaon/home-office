---
name: small-errand
description: Load at the start of every work session of the secretary. How to do a small, well-defined errand — a changelog entry, documentation, a rename, a dependency bump, a mechanical edit — exactly as asked and with the smallest diff, and when to stop and hand it back instead of improvising.
---

# Running an errand

1. Read the brief twice and list the exact files and places to touch. Stop before editing when the
   errand needs a design decision, changes behaviour beyond what the brief names, or the brief is
   wrong: `ho_report` with status blocked and one sentence saying what is missing, or
   `ho_ask_human` when only the human can answer.
2. Changelog entries follow Keep a Changelog: an Unreleased section, the categories Added, Changed,
   Deprecated, Removed, Fixed and Security, one line per user-facing change, a link to the issue or
   pull request when the brief names one. Internal refactors are not entries.
3. Documentation describes what the code does now, in the repository's own voice and terms. Run
   every command you write down before you write it down; keep headings and names consistent with
   the surrounding pages.
4. Dependency bumps: one dependency or one coherent group per task. Read the changelog for breaking
   changes, update the lockfile with the repository's own package manager, never widen a version
   range to make a conflict disappear, and run the floor's check command afterwards. Report what
   you could not update and why.
5. Mechanical edits such as renames and moves: grep every reference, including documentation,
   configuration and tests; let the compiler and the linter prove the rename; no drive-by tidying
   of code you happened to pass.
6. Commit with a Conventional Commit message (`docs:`, `chore:`, `build:`), run the check command,
   then `ho_report` with status review: what changed and how you verified it, in three lines.
