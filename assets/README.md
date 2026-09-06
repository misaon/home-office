# Assets

## Approved office design

[office-base-v1.png](reference/office-base-v1.png) is the owner-approved visual reference (2026-09-06): an overhead
cutaway office with warm orange floors, teal furniture and dark wall caps. Keep it unchanged; see
[docs/OFFICE-ART.md](../docs/OFFICE-ART.md) for the room list, the current state of the integration and what is
still drawn as a geometric stand-in.

## How sprites reach the app

The layout is data (`packages/sim/src/office-plan.ts`): every object has a **sprite key**, a footprint in 16 px
cells and a facing. The renderer looks the key up in the manifest and shows the delivered PNG when it exists,
otherwise a geometric stand-in. Delivering a sprite therefore means dropping correctly named PNG files into
`assets/src/` and running `bun run assets:manifest` (the dev build reloads the page).

```
assets/src/<category>/<sprite>/<animation>[_<dir>]_f<frame>.png
```

- `category`: `furniture`, `characters`, `bubbles`.
- `sprite`: the key from the plan (`desk-n`, `chair-s`, `elevator`, `hot-tub`, …) or a character set name.
- `animation`: `static` for furniture without states; `empty`/`full` for the mailbox; characters use `idle`,
  `walk`, `type`, `drink`, `sleep`, `handover`, `receive`, `celebrate`, `smoke`, `relax`, `restroom`, `drop`.
- `dir`: `n`, `s`, `e` for characters; the renderer mirrors `e` for west.
- `frame`: zero-based, `f0`, `f1`, …; single-frame art still uses `f0`.

## Pixel contract

- Native 16 px grid, PNG with alpha, no scaling by the renderer: a sprite is drawn at its own pixel size with its
  **bottom-left corner on the bottom-left cell of the footprint**. Art may overhang upwards (tall shelves, a
  monitor on a desk) and slightly sideways, never below the footprint.
- Furniture sizes therefore follow the footprint in the plan: a desk is 64×32 (+ overhang), a chair 16×16, the
  elevator 128×96, the hot tub 80×96, the meeting table 112×48 and so on. `bun run assets:manifest` prints the
  objects that still lack a sprite together with their footprint size.
- Characters: 32×32 canvas per frame, feet on the bottom row, centred horizontally; the same canvas for every
  animation of a set. Four frames for `walk`, two for `idle`/`type`/`drink`/`sleep`/`handover`/`receive`.
- Emotion bubbles: 16×16, `static_f0.png`.
- No `@8x` deliveries, no chroma keys, no importer: files land in `assets/src` exactly as the app shows them.

## Manifest

`bun run assets:manifest` scans `assets/src` and writes `assets/dist/manifest.json` (git-ignored):

```json
{
  "version": 1,
  "tileSize": 16,
  "sprites": { "furniture/desk-n": { "static": ["assets/src/furniture/desk-n/static_f0.png"] } }
}
```

The UI loads the PNGs individually; atlas packing is a later optimisation.

## Attribution

LimeZu assets themselves are **not** committed here (their license forbids redistribution). Only original or
AI-generated sprites live in this folder.
