# Assets

## Approved office design

[office-base-v1.png](reference/office-base-v1.png) is the owner-approved visual reference (2026-09-06): an overhead
cutaway office with warm orange floors, teal furniture and dark wall caps. Keep it unchanged; see
[docs/OFFICE-ART.md](../docs/OFFICE-ART.md) for the room list, the object table and what is still drawn as a
geometric stand-in. Every generated sprite must match its style, projection and lighting.

## How sprites reach the app

The layout is data (`packages/sim/src/office-plan.ts`): every object has a **sprite key**, a footprint in cells and
a facing. The renderer looks the key up in `assets/dist/manifest.json` and shows the delivered PNG when it exists,
otherwise a geometric stand-in. Nothing else changes when art arrives — no code, no plan edits.

```
assets/src/<category>/<sprite>/<animation>[_<dir>]_f<frame>.png
```

- `category`: `furniture`, `characters`, `bubbles`, `tiles`.
- `sprite`: the key from the plan (`desk-developer`, `chair-qa`, `elevator`, `spa`, …), a character set name or an
  emotion name.
- `animation`: lowercase letters only. `static` for furniture without states; `empty`/`full` for the mailbox;
  character activities are listed below.
- `dir`: `n`, `s`, `e` for characters. The renderer mirrors `e` for west; never deliver `_w`.
- `frame`: zero-based `f0`, `f1`, …, sorted numerically; single-frame art still uses `f0`.

Files that do not match the pattern are listed as `ignored (bad name)` by `bun run assets:manifest`, which also
prints every plan object that still lacks art together with the size the art must have.

## Pixel contract

All sizes derive from one constant, `CELL_PX` in `packages/sim/src/office-plan.ts` — **24 pixels per cell**
(decision D20 in `docs/PLAN.md`; a 4 × 2 desk is 96 × 48 px, a character 48 × 48). The renderer draws art at its own pixel size — no scaling when the size is right.

**Furniture**

- Width = footprint width × `CELL_PX`, exactly. The PNG's **bottom-left corner sits on the bottom-left cell of the
  footprint**. Art may rise above the footprint (a monitor, a tall shelf, the elevator's frame); it never extends
  below or to the sides. A wrong width is scaled to the footprint and reported in the red banner.
- One frame per state, `static_f0.png` for most objects; the mailbox has `empty_f0.png` and `full_f0.png`.
  **Animated furniture** (the hot tub's `bubbles`) is a numbered frame set `bubbles_f0.png … bubbles_f9.png`; the
  plan names the animation the object plays and how: `loop` cycles at 120 ms per frame; `near` scrubs the frames
  by proximity — forward while somebody stands within three cells, backward as they leave; `sim` (the elevator's
  `open`) follows the 0…1 position the simulation publishes, so one closed→open sequence serves both opening and
  closing. Missing frames fall back to `static`. Frames must share one canvas — the converter guarantees that.
- **Layered objects** (the elevator): three objects share one footprint and one source canvas. `elevator-cabin`
  (floor layer, under everybody — a passenger stands _inside_ it), `elevator-doors` (`open_f0` closed …
  `open_f9` open, drawn above the passenger, sliding apart as the car arrives) and `elevator-frame` (the shaft's
  front frame, drawn above the doors). Import the base layer first, then the others with
  `--like furniture/elevator-cabin`: every import records its source canvas, crop and output size in
  `assets/src/<category>/<sprite>/import.json`, and `--like` reuses them verbatim, so a layer that is only door
  panels in the middle of the canvas lands exactly where it sits over the cabin. Layers must be drawn on the same
  canvas size. For a lone sequence whose outline really changes between frames, `--no-align` keeps the shared crop.

**Floor tiles**

- `tiles/floor-<surface>/static_f0.png` for the surfaces the plan uses: `office` (corridors, reception), `carpet`
  (offices, meeting room, lounge), `tile` (kitchen, toilets), `wood` (terrace, spa). A **seamless** square texture
  repeated over the room; import it with the tile size in cells, e.g.
  `bun run assets:import assets/inbox/floor-wood.png tiles/floor-wood/static --cells 4x4` → 96 × 96 px, so the
  pattern repeats every four cells. Rooms without a delivered tile keep their flat palette colour.

**Characters**

- Canvas 2 cells wide × 5 cells tall per frame (48 × 120 at `CELL_PX` 24; people in the reference stand ≈5 cells
  tall and 1.7 wide), feet on the bottom row, centred horizontally, the same canvas for every frame of a set. The
  renderer places the bottom centre on the actor's cell; a set with another canvas width is scaled to two cells
  wide (the 32 px placeholders become 48 × 48).
- Lookup for an actor doing `activity` while facing `dir`: `<activity>_<dir>` → `<activity>_s` → `<activity>` →
  `idle_<dir>` → `idle_s` → `static`. Any frame count works; frame timing is fixed per activity: `walk` 140 ms,
  `type` 180 ms, `celebrate` 250 ms, `idle` 600 ms, `sleep` 900 ms, everything else 320 ms.
- Activities the simulation actually uses, with the facings it asks for:

  | Activity              | Facings requested                                       | Who                                  |
  | --------------------- | ------------------------------------------------------- | ------------------------------------ |
  | `idle`                | n, s, e (+ mirrored w)                                  | everyone; also the fallback pose     |
  | `walk`                | n, s, e (+ mirrored w)                                  | everyone                             |
  | `type`                | n at `desk-n`, s and n at `desk-pair`, s at `desk-boss` | agents at work                       |
  | `drink`               | n (kitchen counter, grill)                              | coffee break                         |
  | `restroom`            | n                                                       | toilets                              |
  | `smoke`               | e                                                       | terrace ashtray                      |
  | `relax`               | n, e, w (sofa, foosball, hot tub, darts)                | breaks                               |
  | `sleep`               | n (boss sofa), w (lounge sofa)                          | rate-limited or off-hours agents     |
  | `handover`, `receive` | towards the other person, any                           | handoffs, mail pickup                |
  | `celebrate`           | s                                                       | finished work                        |
  | `drop`                | n                                                       | the postman at the reception counter |

  Minimum for a usable set: `idle_s`. Recommended full set: `idle` and `walk` in n/s/e, `type` in n/s, and a `_s`
  version of every other activity (it is used for every facing through the fallback). Two frames suffice for
  poses, four for `walk`.

**Bubbles**

- `bubbles/<emotion>/static_f0.png`, 1 × 1 cell, drawn centred two pixels above the character canvas. Emotions:
  `focused`, `happy`, `frustrated`, `question`, `sleepy`, `relaxed`, `talking`, `envelope`.

## Generating with an image model

Image models cannot emit exact small canvases, so they never write into `assets/src` directly. They deliver
**large PNGs with a transparent background**, saved as `assets/inbox/<key>.png` (the originals are versioned so a
sprite can be re-cut after a contract change), and `bun run assets:import` turns them into contract files:

```
bun run assets:import <source.png> <category>/<sprite>/<animation>[_<dir>] [--frames N] [--cells WxH] [--no-key]
```

- Uses the delivered alpha, trims the art to the visible object (alpha below 16/255 counts as empty — generators
  leave an invisible halo far outside the object), scales it with an area-averaging filter to the footprint width
  (furniture) or into the 2 × 2 canvas (characters, 2 × 5 cells) or 1 × 1 (bubbles), anchors it bottom-left or bottom-centre,
  writes the frames and refreshes the manifest. `--frames N` splits a horizontal strip of equal frames; a quoted `*` pattern
  (`"assets/inbox/spa-animate-*.png"`) imports a numbered file sequence as frames f0, f1, … — every frame is cropped
  to the common bounding box and scaled by one factor so nothing jitters; `--cells WxH` overrides the size for
  objects outside the plan.
- A delivery without a single transparent pixel is refused: the background was baked in (a painted
  checkerboard is the classic failure). Re-export with real alpha, or as a fallback on a flat `#FF00FF`
  background — when all four corners are magenta the converter keys it out (tolerance 40 per channel;
  `--no-key` disables that).
- The report shows the resulting size, the scale factor and how far furniture rises above its footprint — check
  that number before accepting a batch.

`assets/reference/crops/` holds 4× enlarged cut-outs of single objects from the approved reference (a developer
desk, the boss desk, chairs, the shared QA desk, a standing and a seated figure). Attach the cut-out of the object
you are generating, not the whole office: the model then keeps its proportions and projection — upright monitors
about 1.5 cells tall, chair backs 2.4 cells, people ≈5 cells tall standing — instead of flattening the object.

Rules for the generation prompt (one object or one frame strip per image):

1. Same projection as the reference: overhead cutaway, front faces visible, light from the top-left, the approved
   palette (warm orange floors, teal upholstery, wood, dark caps). Paste the reference next to the prompt.
2. Transparent background (a real alpha channel, not a painted checkerboard), **no floor, no drop shadow, no
   glow** outside the object. The object fills the frame with a small margin.
3. Frame aspect ratio = footprint ratio plus the intended overhang (a 4 × 2 desk with a half-cell monitor →
   4 : 2.5). Detail only at the level a `CELL_PX` grid can hold; hairline textures turn to noise.
4. Characters: portrait frames in the canvas ratio 2 : 5, feet on the bottom edge of every frame, the same scale
   in every frame of a set (the converter maps the whole frame to the canvas, so a shorter figure in one frame
   stays shorter). Walk cycles as one horizontal strip of equal-width frames.
5. Furniture with two states (mailbox) is drawn twice from the same view; character sets keep one outfit and
   proportions across all activities.

Checklist before a batch: `bun run assets:manifest` lists the keys and sizes still missing; convert one sample,
look at it in the live app (`bun run ui:watch` + `ho daemon --ui`) and only then generate the rest.

## Manifest

`bun run assets:manifest` scans `assets/src` and writes `assets/dist/manifest.json` (git-ignored):

```json
{
  "version": 1,
  "tileSize": 24,
  "sprites": {
    "furniture/desk-developer": { "static": ["assets/src/furniture/desk-developer/static_f0.png"] }
  }
}
```

The UI loads the PNGs individually; atlas packing is a later optimisation.

## Attribution

LimeZu assets themselves are **not** committed here (their license forbids redistribution). Only original or
AI-generated sprites live in this folder.
