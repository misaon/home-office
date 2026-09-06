# Assets

## Approved office design

[office-base-v1.png](reference/office-base-v1.png) is the owner's approved visual reference (2026-09-06). Keep it unchanged and use [the office art production plan](../docs/OFFICE-ART.md) for the verified renderer contract, room requirements and conversion sequence. This concept image is separate from runtime sprites in `src/`.

## Current runtime contract

Pixel-art sources for the office, inspired by LimeZu _Modern Office_: **16×16 tiles**, top-down, PNG with alpha, rendered at integer zoom in the app. The owner generates sprites with AI tools; this folder defines the current import contract. New object behaviours and sizes can require renderer or importer changes; see the production plan above.

## Layout and naming

```
assets/src/<category>/<sprite>/<animation>[_<dir>]_f<frame>.png
```

- `category`: `characters`, `tiles`, `furniture`, `props`, `bubbles`.
- `sprite`: kebab-case identifier (`agent-a`, `boss`, `postman`, `desk-monitor`, `coffee-machine`).
- `animation`: `idle`, `walk`, `sit`, `type`, `drink`, `sleep`, `handover`, `receive`, `open`, `brew`, or `static` for single-frame art.
- `dir` (optional): `n`, `s`, `e`, `w` for 4-direction animations.
- `frame`: zero-based, `f0`, `f1`, …; single-frame art still uses `f0`.

Examples: `characters/agent-a/walk_s_f0.png`, `furniture/desk-monitor/type_f1.png`, `bubbles/question/static_f0.png`.

## Frame sizes

- Characters: 32×32 canvas per frame, feet at the bottom centre (row 30), so heads can overlap walls.
- Tiles and small props: 16×16. Large furniture: multiples of 16, currently at most 64×64 per frame in the importer (e.g. 32×16 desk, 32×32 sofa).
- Emotion bubbles: 16×16.

## Delivery format from image generators (`@8x` strips)

Image models cannot emit true 16×16 canvases, so generated art is delivered **8× scaled** on a pixel grid (every logical pixel is an 8×8 block) with a transparent background (fallback: solid `#FF00FF`, which the importer keys out):

- single frame: `<animation>[_<dir>]_f0@8x.png` (a 32×32 character frame arrives as 256×256, a 16×16 tile as 128×128)
- animation: one **horizontal strip** `<animation>[_<dir>]_strip<N>@8x.png`, N equal frames side by side, no gaps, no borders
- wall autotile: `autotile3x3@8x.png` (48×48 logical: a 3×3 set of corners, edges and centre)
- only directions `s`, `n`, `e` are drawn; `w` is the renderer flipping `e`

Drop the files under `assets/inbox/<category>/<sprite>/`; `bun run assets:import` (Phase 4, P4.0) samples the centre of each 8×8 block, slices strips into `_f<n>.png` frames at native size and writes them to `assets/src/…`, so the manifest below never sees scaled art.

## Manifest

`bun run assets:manifest` scans `assets/src` and writes `assets/dist/manifest.json` (git-ignored):

```json
{
  "version": 1,
  "tileSize": 16,
  "sprites": {
    "characters/agent-a": {
      "walk_s": ["characters/agent-a/walk_s_f0.png", "characters/agent-a/walk_s_f1.png"]
    }
  }
}
```

The UI currently loads PNG textures individually. Atlas packing is a later optimisation; measure the completed scene before deciding it is required.

## Attribution

LimeZu assets themselves are **not** committed here (their license forbids redistribution). Only original or AI-generated sprites in the same style live in this folder.
