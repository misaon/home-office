# The drawing, rewritten in Tailwind 4

The owner's task: every style in the project becomes a Tailwind class, with modern patterns, minimum
duplication and no raw CSS anywhere; the result must be pixel-identical to what it replaced, hover
states, animations and transforms included, verified in a browser; and the build must contain only what
the office actually uses.

## What the office looked like before

`packages/ui/src/design` held the drawing as the drawing was authored: 594 inline `style` objects and
166 style constants across 71 files, plus `packages/ui/src/design/design.css` — 427 lines of reset,
seventeen `@keyframes` and thirty-six `:hover` rules carrying `!important` so they could beat the inline
styles they sat beside.

## What it is now

`packages/ui/src/design/app.css` is the only stylesheet. It imports Tailwind and the fonts, points four
`@source` globs at the code, and then declares the office: one `@theme` block holding the palette, the
type scale, the radii, the shadows, the easings and the thirty animations, and three `@utility` blocks
for the things Tailwind has no name for. `design.css` is deleted.

Every visual decision is now a class on the element that wears it. Thirteen `style` attributes remain and
each one sets only a CSS custom property that a utility reads back — `w-(--sheet)`, `translate-x-(--slide)`,
`bg-(--glow)`, `wait`. React's `CSSProperties` was widened once, in `design/tokens.ts`, so none of the
thirteen needs a type assertion.

## Decisions the measurements forced

| Decision                                                 | Why it is not taste                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| alpha colours are named tokens, not `/opacity` modifiers | `accent/12` compiles to `color-mix(in oklab, …)`, which lands up to one channel value away from the drawing's `rgba()` — on 11 of the 29 alphas             |
| `--radius-half: 50%`                                     | `rounded-full` is `calc(infinity * 1px)` and rasterises differently from `border-radius: 50%`                                                               |
| `--default-transition-timing-function: ease`             | Tailwind's default is `cubic-bezier(.4, 0, .2, 1)`; the drawing's bare `transition: … .2s` means `ease`                                                     |
| `@custom-variant hover (&:hover)`                        | Tailwind wraps `hover:` in `@media (hover: hover)`; the drawing's rules had no such condition, so on a touch pointer the office would lose its hover states |

Preflight is kept — it is the reset — but it removes user-agent defaults the drawing was measured
against, and each had to be restored deliberately: `line-height: 1.5` on `<html>`, button and input
padding, `<p>`'s block margins (72 px of lost height in the setup dialog alone), checkbox margins, and
`::placeholder`'s colour on eleven inputs.

## The build

`scripts/ui-build.ts` registers a Bun `onLoad` plugin for `app.css` alone: it resolves `@tailwindcss/cli`
through the package graph, spawns it, and hands the finished stylesheet to the bundler. `bun-plugin-tailwind`
was considered and rejected — its last release is 0.1.2, 2025-10-09, and it predates this Tailwind line.
knip cannot see a binary that is spawned rather than imported, which is the one `ignoreDependencies`
entry in `knip.json`.

## What verification found

Two builds were served side by side — the commit before this work on one port, the rewrite on another —
and compared three ways over 28 states of the office. Each way found things the others could not.

**Pixels.** Both builds screenshotted at 1440×900 with animations disabled outright
(`animation: none !important`, every running animation cancelled) and the PixiJS canvas hidden, so the
comparison covers every pixel of the viewport at zero tolerance rather than excluding the canvas
rectangle. Result: **all 28 states byte-identical**. One state first differed by 45 px in a 6×9 glyph;
the glyph is a relative timestamp (`-7h`) that had ticked between the two runs, and re-shooting the two
builds back to back made it identical.

**Computed styles.** Every element in every state, ~100 painting properties each plus `::before`,
`::after`, `::placeholder`, `::selection` and `::marker` — run twice, once at rest and once with `:hover`
forced on every element through `CSS.forcePseudoState`, because a screenshot cannot hold a pointer. Every
hover rule in the drawing is `.ho-xxxx:hover`, painting only the element under the pointer and nothing
else, so holding all of them at once asks the question of all of them at once. Result: **28 of 28 states,
0 property differences, at rest and hovered**. This is what caught the differences pixels
could not see — anything drawn over the canvas rectangle was invisible to the screenshot comparison
while that exclusion existed. Four differences are structural and paint nothing, so they are named in
the harness rather than counted: lightningcss expands a trailing `sans-serif` into a legacy fallback
list when it can see the generic literally and cannot when it arrives through a variable; preflight sets
`border-style`/`border-color` on everything at zero width; preflight writes out the `appearance` the
user agent was already applying; and Tailwind composes five shadow layers where four are transparent and
zero-sized.

**Conflicts.** A scan that reads the built stylesheet for what each class declares, then asks every
element in every state whether it wears two classes fighting over one property — because Tailwind
decides that by the order it emitted them, not the order they are written. Four remain and all four are
the intended override idiom (`border border-dashed`, `transition-transform duration-340`).

Five real defects came out of this, each invisible to the screenshots:

1. **The Git URL field had no border colour.** A ternary still held the drawing's raw `#2C2C32`, which
   became a class named `#2C2C32` that matches nothing; the field fell back to `currentColor`.
2. **The tab marker did not slide.** `transition-[transform]` cannot animate Tailwind 4's `translate`
   property. Verified by compiling Tailwind 4.3.3: `transition-transform` is
   `transition-property: transform, translate, scale, rotate` and `transition-[transform]` is only
   `transform`.
3. **The select chevron did not turn** — the same fault, `rotate-180` against `transition-[transform]`.
4. **The Follow button never lit up.** Its shared constant carried `bg-transparent text-ink-quiet` and
   the ternary added `bg-accent-a16 text-accent-soft`; `.bg-transparent` is emitted _after_
   `.bg-accent-a16`, so the off state always won.
5. **The `lightbox` state was never actually tested** — its step matched by text on a button that has
   none, and failed identically on both sides, so the comparison passed while comparing the wrong screen.

## What the build contains

Measured on the production bundle:

|                                               | Tailwind rewrite | Previous build  |
| --------------------------------------------- | ---------------- | --------------- |
| stylesheet, without the inlined fonts         | 63 021 B         | 5 891 B         |
| stylesheet, total (fonts are 540 394 B of it) | 603 415 B        | 546 285 B       |
| script                                        | 1 273 742 B      | 1 301 616 B     |
| **both files**                                | **1 877 157 B**  | **1 847 901 B** |
| distinct utility classes                      | 688              | 37              |
| theme variables reaching `:root`              | 248              | 0               |
| `@keyframes`                                  | 15               | 17              |

29 256 bytes — 1.6% — more across the two files. Only what the office uses is emitted: the two
`@keyframes` that disappeared are `float1` and `float2`, which `design.css` defined and nothing used.
