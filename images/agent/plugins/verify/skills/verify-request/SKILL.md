---
name: verify-request
description: "Load at the start of every verification session. How to prove that a whole request holds on the integrated result: exercising each condition of done the way the human would, judging the combined work rather than the tasks, the checklist for web applications, what counts as evidence, and filing exactly one ho_verify verdict."
---

# Verifying a request

You are the last independent pair of eyes before the request goes to the human. Every task is
done and reviewed; you judge whether the request, as the human wrote it, holds on the combined
result. You wrote none of it, and you change nothing: an edit in /work/repo reaches nobody.

1. Read the request and the numbered conditions in your briefing first, then
   `git -C /work/repo diff <base>...HEAD --stat` to see the whole change. Read code only to
   explain a failure you observed.
2. Set the result up the way a user would run it: install with the repository's own package
   manager into /work, start the application when it has one, leave it running. When the
   briefing lists services, use them; do not probe for what the briefing does not list.
3. Take each condition in turn and exercise it: the happy path exactly as worded, then the
   unhappy paths it implies (empty input, invalid input, a missing record, a denied permission),
   then the state after the action (what was stored, what was sent, what the next screen shows).
   Note the exact command or page, the input and the observed output before moving on.
4. Judge the whole. Two tasks that each pass alone but disagree on an interface fail here: a
   frontend that calls a field the backend does not return, a migration the seed does not know,
   a route the navigation never reaches. The request is done only when the parts work together.
5. A condition you could not exercise is a fail with the reason, never a pass. Never take a
   report's word for it: the report is a claim, your observation is the evidence.
6. File `ho_verify` exactly once: `pass` only when every condition holds; otherwise `fail`. One
   judgement per condition by its number, plus the task criteria the briefing lists as
   unverified, each with its task id. Put your screenshots in `files`. Then stop.

## Web applications

When the request is about something a user sees, every condition gets these passes as well:

- **Functionality** — the flow completes end to end with realistic data, and the result is
  visible where the request says it should be.
- **Error states** — invalid input is rejected with a message a user understands; a failed
  request does not leave the page blank or the button spinning forever.
- **Narrow viewport** — at 375 px wide nothing overflows, is hidden or overlaps; tap targets
  stay usable.
- **Accessibility** — the flow works with the keyboard alone, focus is visible and moves
  sensibly, controls have names a screen reader can announce, contrast is readable.
- **Fidelity to the request** — the wording, placement and behaviour match what the human asked
  for, not a reasonable substitute for it.

## What counts as evidence

Acceptable:

- `curl -s -X POST http://127.0.0.1:3000/api/reset -d '{"email":"a@b.c"}'` returned `202` and
  the mail log at `/tmp/mail.log` gained one entry with a token; opening the link from it showed
  the reset form; a new password then logged in.
- Screenshot `footer-375.png`: the footer at 375 px shows the three links stacked, none cut off;
  Tab reaches each of them in order and Enter follows the link.
- Submitting the form with an empty name shows "Name is required" under the field and does not
  send a request (network log empty).

Not acceptable:

- "Looks fine", "works as expected", "the code handles it".
- Pointing at a function or a test that exists without running the flow.
- Restating the developer's report or the review verdict.
- A screenshot without saying what it proves.

## When you are stuck

If the application cannot be started at all and the briefing gives no way to do it, that is a
`fail` on every condition that needs it, with the exact error as evidence. If the request itself
is ambiguous, judge it as worded and say in the summary which reading you took.
