# Porting the drawn office into React

The owner had the office drawn and left it in the repository; it lives at `docs/design/Home Office.html`,
where the formatter leaves it alone. They asked for it in our stack — clean, performant React — and for proof that the result is the same picture, pixel for
pixel. This is what the file turned out to be, how it was ported, and how "the same" was measured.

## What the file is

A self-extracting bundle, 450 037 bytes over 391 lines. `<script type="__bundler/template">` holds the
page as a JSON string; `<script type="__bundler/manifest">` holds fourteen assets, each base64 of a
gzip stream. Unpacked, the page is:

- an `<x-dc>` template, 865 lines of markup with 463 `style` attributes, 56 `style-hover` attributes and
  a small directive set (`sc-if`, `sc-for`, `sc-camel-on-click`, `{{ }}` interpolation);
- a `<script type="text/x-dc">` of 447 lines: one class holding all state and returning a view model;
- three JavaScript assets — React 18.3.1, ReactDOM 18.3.1 and a 69 kB `dc-runtime` that interprets the
  template — and eleven woff2 fonts.

So the design is not a picture of an app, it is an app: a complete Home Office with two floors, three
people, ten tasks, and every panel, sheet, popover and overlay wired to hard-coded fixtures.

## How it was ported

The markup was converted mechanically before a line was written by hand. A 130-line script parses the
template and emits JSX: `style` strings become style objects, `sc-if` becomes a conditional, `sc-for`
becomes `.map` with the index key the original runtime used, and `style-hover` becomes a class in a
stylesheet, with `!important` on every declaration because that is what the original runtime generated
and the rules have to beat the inline styles beside them. That output was the reference for writing the
components; it is not in the tree, because generated JSX is not code anyone wants to maintain.

Two details in that conversion decide whether the port can be identical at all:

- **White space.** HTML collapses runs of white space to one space and drops a run at the start or end
  of an element's content. `You · {{ m.time }}` is one text node; trimming its literal half would render
  `You ·21:52`. The converter models the collapsing rule instead of trimming.
- **Interpolation spans.** The original runtime wraps every `{{ }}` in a bare `<span>`. Inside a flex or
  grid container that span is a flex item, so `{{ a }} · {{ b }}` is three items with `gap` between them
  where merged text would be one. The five places that mix literal text with an interpolation keep the
  original's spans; at `panelWidth: 520` the merged form rasterised one glyph of `20:56:20` differently,
  which is how the rule was found rather than guessed.

State is a Zustand store, which is what the rest of `packages/ui` uses: the original's `setState` shape
survives as `set`, `update`, `patchCur` and `patchFloor`, and the two pieces of real behaviour — the
boss's delayed reply and the totals counting up over a second — are actions on it. The fixtures are in
`data.ts` and `data-setup.ts`, unchanged from the drawing down to the thin spaces between thousands.

Forty-three components, none over the 120-line function cap, each holding one part of the drawing.
Static style objects are module constants rather than literals in JSX, so nothing re-allocates per
render; React Compiler is on, as it is for the rest of the UI build.

## How "identical" was measured

Eyeballing cannot answer this question, so it was not used to answer it. A harness drives headless
Chrome over CDP, loads the original and the port at the same viewport, freezes animations and
transitions in both (`animation: none !important; transition: none !important`), pins any
already-scrolled container to its end — the chat scrolls itself in a `requestAnimationFrame` in both
implementations, and two captures otherwise land a few pixels apart — and compares the two PNGs
channel by channel with a dependency-free decoder.

The original's own props are reachable at run time through `window.__dcSetProps`, so the port's knobs,
which it reads from the query string, can be set on both sides and compared.

The harness is not in the tree — this repository adds no tests without being asked — so the runs below
are recorded here the way `audit/VERIFICATION.md` records its own: the command and its real output.

```
$ bun run suite.ts
✓ chat  (1440x900)
… 65 states …
✓ size-tall  (1440x1200)

all 65 states identical
```

Sixty-five states: the five panels, both sheets, every popover and dropdown, the lightbox, the setup
overlay, the internal editor, the hire form with a select open, a message sent and its reply, the board
filtered three ways and cleared, both languages, the second floor, fourteen panel widths from 360 to
520, and nine viewports from 644×1036 to 1920×1080. Zero differing pixels in every one, at a threshold
of 2/255 per channel — the strict result is that not one pixel differs at all.

Two things a frozen screenshot cannot see were measured separately:

```
$ bun run motion.ts
✓ chat: 35 declarations match          $ bun run hovers.ts
✓ board: 45 declarations match         ✓ chat: 16 hover states identical
✓ team: 30 declarations match          ✓ board: 23 hover states identical
✓ usage: 43 declarations match         ✓ team: 16 hover states identical
✓ settings: 44 declarations match      ✓ settings: 24 hover states identical
✓ setup: 43 declarations match         ✓ setup: 22 hover states identical

motion identical in every scene        every hover state matches
```

The first compares the computed `animation` and `transition` of every element in both pages. The second
forces `:hover` on each button in turn through `CSS.forcePseudoState` and diffs the page each time —
101 hover states over five scenes.

## What happened next

The owner did not want two offices, so the fixtures and the preview entry are gone and these components
are now *the* office: `index.html` renders them against the daemon. The measurements above therefore
describe the port at the moment it was made, and they are no longer re-runnable — real content is not
the fixture content, which is exactly why the verification landed before the wiring rather than after.

What the wiring changed, and why:

- **The stage draws the real office.** The mockup sketched a light floor with two drifting discs; the
  product renders a pixel-art office in PixiJS. The sketch was a placeholder for it, so the frame, the
  scan line and the camera bar are the design's and what they contain is the real canvas. The bar drives
  the real camera through a handle `startOffice` now returns.
- **The board grew a fourth lane.** The drawing has three; a task has nine states. `inbox` and `planned`
  had nowhere to go, so they get a lane of their own, drawn in the same language as the other three.
- **Three drawn things had nothing behind them and were dropped:** the attach menu's three sources
  (there is one — a file), the "subscription window" meter (no provider tells the office a plan's
  quota), and the four mock setup steps (the real checklist does Docker, images, token and smoke test).
- **Three surfaces still wear the old skin:** the setup overlay, the add-project dialog and the internal
  editor. They are real, working tools that the drawing either sketched or never drew, and restyling
  them is the next piece of work.

One rule was suppressed twice, in `board-card.tsx` and `team-row.tsx`: `jsx-a11y/prefer-tag-over-role`,
where a row is drawn as a `div` with `role="button"`. The board's row carries its own delete button and
a `<button>` may not contain another, so that row cannot be the tag the rule asks for; the team's row is
kept the same element for consistency. Both take Enter and Space and carry a label. Recorded in
`audit/SUPPRESSIONS.md`.
