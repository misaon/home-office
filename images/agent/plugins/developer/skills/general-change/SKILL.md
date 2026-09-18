---
name: general-change
description: Load in a work session when the task belongs to no specialist — a script, a build file, a CLI, a library, glue between two parts. How to bound the reading, take the convention from the code around you, change every call site rather than one, verify the way the repository verifies, and hand the task on when it turns out to belong to a specialist after all.
---

# A change outside anyone's specialty

1. Bound the reading. Open what the brief names, then its nearest neighbours: whatever calls the
   thing you are changing, and the closest sibling of the file you are about to add to. Stop as soon
   as you can name the convention and list the call sites. Reading on past that point is how a
   session ends with nothing committed.
2. Take the convention from the code around you, not from your habits: how this repository names
   things, reports errors, lays out a module of this kind, and whether it tests at all. Where two
   parts of the repository disagree, follow the one nearest your change and say which you followed.
3. Change the shape everywhere in one task, or not at all. Grep for every caller of what you touch —
   the identifier, the type, and the string form if it has one — and change them with it. Work that
   is right where you edited it and stale at three call sites is the usual way this role fails.
4. Make the smallest change that meets the criteria. Do not rename, reformat or restructure on the
   way past. A diff a reviewer cannot read line by line is a diff that hides its own defect; raise
   the tidy-up separately.
5. Verify the way the repository verifies. Where it has tests, add one at the lowest layer that
   proves the behaviour and run the whole affected suite, not only yours. Where it has none, say so
   and give what you ran by hand instead: command, input, expected, actual.
6. Hand off rather than guess. When the work turns out to sit behind an API contract, a data
   migration, an authorisation check or a rendered page, this floor has someone whose reviewers
   expect that craft. Commit what is coherent and call ho_handoff with what you found.
7. Report for someone who knows this area better than you do: what changed, which convention you
   followed and where you read it, every call site you touched, and what you left alone on purpose.
