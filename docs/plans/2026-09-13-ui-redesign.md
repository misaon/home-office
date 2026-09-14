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

**Opening and closing are the same gesture, backwards.** A settings drawer or a colleague's card used to
animate open and then vanish in one frame, which is half an animation. Both directions now run at the
same speed through one `Reveal`: the content sits in a grid row that goes from nothing to its own height
and back, which is how a height CSS cannot know in advance becomes something it can interpolate. Closed
content stays in the document and is marked inert, so the keyboard cannot reach what the eye cannot.

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

Every panel is looked at in the browser at the size the app really runs at, in both languages. The check
is that nothing moves without being asked to, and that a first-time reader can name what each panel is
for.

The pass ran against a scratch daemon on port 47810 with its own state directory, never the owner's:
Chat (with a real session's text, an uploaded image and a generated one), Board, Team, Usage in both
views, Settings with its drawers open, the setup overlay, the add-project dialog and the image viewer,
in Czech and in English. A message sent during the pass confirmed the arrival animation from the page
itself — `rise`, 0.32 s, on the overshoot easing — while the messages already on screen carried none.
`bun run check` — six typecheck programs, `oxlint --deny-warnings`, `oxfmt --check` over 309 files,
`knip`, and the production UI build — passes.

What the browser here cannot show is a transition's frames: the pane renders at about one frame a second
while it is hidden, measured at 960 ms and then 1009 ms between two `requestAnimationFrame` callbacks on
a visible, focused document. So a transition was verified by what it declares — property, duration and
easing on the element, and the start and end states it moves between — not by watching it move.

**Reduced motion** was confirmed in the built stylesheet rather than under a browser reporting the
preference: the production CSS carries one `@media (prefers-reduced-motion: reduce)` block that caps
every animation and transition at 1 ms and sets `scroll-behavior: auto`, and no tool available here can
turn the preference on.

The second round replaced the frame counting with a measurement that survives a slow pane: when a
transition starts, `getAnimations()` lists it. Opening the add-project dialog reports three running
transitions — the dialog's own opacity and transform, and the backdrop's opacity, each 200 ms — and
closing it reports five, the two discrete ones for `display` and `overlay` among them. A settings drawer
reports one `grid-template-rows` transition of 200 ms. That is the difference between a transition that
is declared and one that actually runs, which is what the first round could not tell apart.

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

## What the owner's review changed

The first round left three things that only someone using the office would notice, and each turned out
to have a cause worth stating.

**A dropdown could not be styled, because it is not an element.** The list a `<select>` opens is a
window the operating system paints: no colour, radius or shadow from this stylesheet reaches it, and the
arrow is whatever the platform has. `kit/select.tsx` replaces it with a button and a list the office
draws — the list goes in a portal at the document's own corner, positioned in fixed coordinates, so no
panel's overflow can clip it and nothing has to fight z-index. It keeps what a select is for: the
keyboard opens it, arrows walk it, Enter commits, Escape and Tab close it, the current option is marked,
and anything that moves the field closes the list rather than letting it drift. Nine native selects went.
`jsx-a11y/prefer-tag-over-role` is off for that one file, because the rule's advice is to use the element
being replaced.

**A dialog opened in one frame because a keyframe cannot wait for it.** `animate-pop` started when React
mounted the element, which is before `showModal` puts it in the top layer, so the animation was over
before anything was visible. Dialogs now transition instead, from the style `@starting-style` gives them
for the frame they appear in, with `display` and `overlay` transitioned discretely so the same rule plays
backwards on close. That needs the element to stay in the document while it leaves: `Modal` takes an
`open` prop rather than being unmounted, and where a component must be unmounted it is held for one
`EXIT_MS` first. The setup checklist and the office editor became real dialogs at the same time, which
also got them Escape and an inert background for free.

**The image viewer had been left as it was.** It now has the office's toolbar — the file name, the zoom
as a badge, two zoom steps, fit and close as the same buttons used everywhere — the image sits at its
natural size instead of being blown up to fill the pane, a drag shows a grabbing cursor, a double click
fits, and the zoom itself eases rather than stepping.

Three more came out of the sweep that followed: a `Reveal` that leaves the document after it closes, so
it cannot leave a gap behind in a parent that spaces its children; the same `Reveal` around the office's
connection and error strips, which used to vanish in one frame; and the editor's file picker, which drew
a native button and a "no file chosen" in the system's language.

## The palette, repitched 2026-09-14

The owner could not tell the surfaces apart: bubble, button and ground all read as the same dark. They
were. The ramp moved by about five units a channel between one surface and the next, which is under a
percent of lightness — a step the eye cannot find an edge in. It now roughly doubles at each step, from
the ground through panels to cards, and the greys lost their blue cast, which is what had been turning
every gold tint olive.

Gold stopped being decoration and became the office's one piece of information. It says **yours** and
**active**, in three strengths: solid for the message you wrote and the button that commits, a dark tint
(`--color-accent-soft`) for a surface that belongs to you, such as the floor you are standing on, and
the colour itself for a mark. The chat is where this pays: your own messages are solid gold with dark
text and the floor's answers are grey cards, so the column reads as a conversation before a word of it
is read. Warn moved from amber to orange for the same reason — a warning in the accent's own hue reads
as the accent.

The three weights of writing were measured rather than eyeballed, and then measured again against the
**darkest** ground rather than a card, because that is where the intros and hints actually sit: muted
clears 11:1 there and faint clears 7:1. Ranking the three by dimming until the last one disappears is
how two palettes in a row ended up with hint text nobody could read. A quiet button no longer borrows
the surface of the card it stands on, and the composer sits on the panel surface, so writing is a place
of its own rather than the end of the transcript.

The first cut of this made your own messages solid gold. It won the glance and lost the reading, so they
are a tint again — lighter than the tint that came before it, with a defined edge.

## The chat's own furniture, 2026-09-14

**The composer was a stack of rows and is now one box.** A label row, a field and its padding took a
third of the panel before a word was written. The field is inside the box, its controls sit on the box's
own bottom edge, and the field measures itself: two lines to start with, growing with the draft to eight
and no further, because past that the transcript matters more than the draft. The send hint left the
placeholder for the field's tooltip, and attaching is an icon rather than a sentence.

**Spend moved into that bottom edge.** A chip carries a dot and a number: the tokens this office
measured in the last day, and whether anything is running or waiting. It opens a panel with the split,
the turns, how many sessions are running against how many the window saw, the rate limits it hit, the
time a provider asked it to come back, and for each running session either its spend or how full its
context window is. It shows **no percentage of a plan's quota**, and says so in a line at the bottom: no
provider tells the office what that quota is, so a gauge would be a guess wearing a number.

**The floor is a picker rather than a row of tabs.** Tabs are fine for three projects and unusable for
thirty. One button, a list that takes typing, and the search reads the repository as well as the name,
so two floors called `api` are still told apart. The panel beside the office went from 460 to 500 px.

All three lean on one new primitive, `kit/popover.tsx`: where a surface anchored to a control goes, when
it leaves, and what closes it. The select's own dropdown was already that code, so it moved rather than
being copied.
