# The office UI, redesigned, 2026-09-13

Owner task: refactor and modernise the whole UI, add proper animation (chat bubbles that rise, among
others), rearrange the elements more logically, unify the style, and give it a luxury feel. Nothing may
jump, jerk or change without a transition. Clarity matters as much as looks: it has to be obvious what
each thing does and where anything is turned on or configured.

## The language

**One palette, layered.** The ground stays the deepest surface; panels sit above it, cards above panels,
each a step lighter with a hairline border and a one-pixel highlight along the top edge. Depth comes from
that stack and from soft shadows, never from heavy borders. Gold stays the single accent, because it is
the office's identity; it marks what is active, never decorates.

**Motion is a token, not a decoration.** Three durations (120 ms for feedback, 200 ms for state, 320 ms
for entrances) and two easings: a soft deceleration for everything, and one gentle overshoot reserved for
things that arrive — a chat bubble, a card that appears. Everything that can move has a transition, so no
element ever changes position, size or colour in a single frame. `prefers-reduced-motion` turns the
movement off and keeps the fades, because motion sickness is not a style choice.

**Every interactive thing answers.** Hover lifts a card by one pixel and warms its border; a press scales
it to 0.98; focus draws a gold ring. A list that grows animates the new row in rather than snapping the
rest down.

## The rearrangement

The right rail had six tabs, and the floor's people lived in two of them: one to watch, another to edit.
Five now, each with one job:

| Tab      | What it is for                                                                       |
| -------- | ------------------------------------------------------------------------------------ |
| Chat     | Talking to the floor's boss, with files both ways                                    |
| Board    | The floor's work, by status                                                          |
| Team     | The floor's people: what each is doing now, and everything about them in one card    |
| Usage    | What the office spends and what it holds: tokens and resources, one switch apart     |
| Settings | The office itself: language, credentials, and each floor's repository and connectors |

Team merges the old Agent inspector with the agent editor from Settings: one card per colleague, live
state on the front, their model, effort and persona one click deeper. Usage absorbs Resources, because
both answer "what is this costing me".

Inside Settings, every switch becomes a real switch with its consequence written beside it, so turning
something on never requires guessing what it does.

## What stays

The office canvas, the event flow, every RPC and the Czech and English dictionaries. This is a change of
surface, not of behaviour, and the office's own protocol is untouched.

## Verification

Every panel is looked at in the browser at the size the app really runs at, in both languages, with the
office online and offline, and with motion reduced. The check is that nothing moves without being asked
to, and that a first-time reader can name what each panel is for.

The pass ran against a scratch daemon on port 47810 with its own state directory, never the owner's:
Chat (with a real session's text, an uploaded image and a generated one), Board, Team, Usage in both
views, Settings with its drawers open, the setup overlay, the add-project dialog and the image viewer,
in Czech and in English. `bun run check` — six typecheck programs, `oxlint --deny-warnings`, `oxfmt
--check` over 309 files, `knip`, and the production UI build — passes.

## What looking at it changed

Five things the code review would not have caught, each found by watching the page rather than reading
it:

- **The chat used to scroll through its own history on open.** A smooth `scrollIntoView` from the top of
  a long conversation is a second of travel the reader did not ask for. The backlog now lands at the end
  at once and is not animated; only what arrives afterwards rises in, which is what the animation was
  for.
- **An attached image resized its bubble when its bytes arrived.** The office records a file's name,
  type and size, never its dimensions, so nothing could reserve the right space. Every image now takes
  the same tile, and the picture is centred in it at its natural size.
- **The controls the platform draws for itself were light.** A checkbox in the add-project dialog and a
  select's arrow came from the browser's default light scheme on top of a dark panel. Declaring a dark
  colour scheme on the root is the only thing that reaches them.
- **Prune was the loudest button in the office.** It removes containers, volumes and images, and its
  consequence lived in a tooltip. It is now an ordinary button with that sentence written under it.
- **The intake form was a cramped two-column grid.** One column, with the interval and the
  acknowledgement label on one line, reads as a sentence instead of a table.
