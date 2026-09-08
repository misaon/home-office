# ADR 003 — C3: How should we work with sprite files?

**Status:** decided — keep the pipeline, move exact pixel work onto `sharp`, add a texture atlas.
**Confidence:** high on the first two, medium on the atlas.
**Date:** 2026-09-08.

## The problem

Sprites are the product's visual substance and the pipeline around them is homegrown. Measured state:

- **306 tracked PNGs**: 48 raw deliveries in `assets/inbox`, ~250 imported frames under `assets/src`,
  8 reference images in `assets/reference`.
- **43 sprite keys** in `assets/dist/manifest.json`; the office plan references many more, so most
  furniture still renders as a geometric stand-in (233 lines in `packages/ui/src/office/stand-ins.ts`).
- **The pipeline:** `assets/inbox/*.png` → `bun run assets:import <source> <category>/<sprite>/<anim>` →
  `assets/src/<category>/<sprite>/<anim>_f<n>.png` plus an `import.json` sidecar → `bun run assets:manifest`
  → `assets/dist/manifest.json` → the UI fetches the manifest and then each frame by path.
- **Loading:** `packages/ui/src/office/sprites.ts` loads **every frame as an individual texture** —
  measured live in this session: **251 HTTP requests**, all 200.

The brief's constraint: original sprite files must not be deleted. `assets/inbox` holds the raw deliveries,
so a re-import is recoverable — but re-importing rewrites tracked art, so it is not something an audit
should do casually.

## Options

### 1. Keep the pipeline exactly as it is

**Gain:** it works, and it encodes real knowledge — the `--like` sidecar registers layers drawn on one
source canvas (elevator cabin / doors / frame) so they land pixel-aligned; per-frame trimming plus
resampling to a common canvas removes the silhouette drift generators introduce between frames; a content
hash in `manifest.revision` busts the browser cache.
**Lose:** the 164 lines of hand-written raster code and the 251-request load stay.
**Migration:** none. **Code deleted:** none.

### 2. Move the exact pixel operations onto `sharp` — **recommended**

`sharp@0.35.4` (published 2026-08-26, 69.6 M weekly, Apache-2.0) is **already a dependency** and already
does the decode/encode in `scripts/lib/png.ts`. Four of the seven operations in `scripts/lib/raster.ts`
have exact libvips equivalents:

| Ours                                | sharp                                         | Exact?                            |
| ----------------------------------- | --------------------------------------------- | --------------------------------- |
| `crop(img, box)` (`raster.ts:82`)   | `.extract({left,top,width,height})`           | yes — pixel copy                  |
| `place(img, w, h, anchor)` (`:138`) | `.extend({top,bottom,left,right,background})` | yes — pixel copy onto transparent |
| `opaqueBounds(img)` (`:64`)         | `.trim()` (reports offsets)                   | yes — bounding box                |
| `splitStrip(img, n)` (`:158`)       | `.extract()` in a loop                        | yes                               |

**Gain:** ~80 fewer lines of pixel loops, executed in libvips rather than JavaScript, with no change in
output because all four are exact copies.
**Lose:** the helpers become promise-based, so `assets-import.ts` needs a small restructure.
**Migration:** `scripts/lib/raster.ts` and its two callers. **Code deleted:** ~80 lines.

**Deliberately excluded: `resample` (`raster.ts:95-133`).** It is an area-averaging box filter working in
_premultiplied alpha_ so transparent neighbours cannot bleed dark fringes into sprite edges. sharp's
`.resize()` offers kernels `nearest|cubic|mitchell|lanczos2|lanczos3|mks2013|mks2021`, but I could not
verify from the documentation opened in this session that any of them reproduces this filter byte-for-byte,
and a difference would change all ~250 imported PNGs. Keeping it is the honest call; replacing it belongs
to a deliberate re-import of the art, not to an audit.
**Zdroj:** https://sharp.pixelplumbing.com/api-resize and /api-operation, read 2026-09-08.

### 3. Add a texture atlas — **recommended, medium confidence**

**Gain:** 251 individual textures become one or a few atlas pages. That removes 250 HTTP round trips and,
more importantly for the renderer, lets Pixi batch draw calls instead of switching texture per sprite. The
manifest already knows every frame and its animation, so the atlas manifest is a mechanical transform of
data we already generate.
**Lose:** a build step and a size budget; the packing must be deterministic so `manifest.revision` stays
stable.
**Migration:** `scripts/lib/manifest.ts` gains a packing step; `packages/ui/src/office/sprites.ts` loads
atlas pages and slices `Texture`s by frame rectangle — which this codebase **already does** in
`packages/ui/src/office/walls.ts:116-118` (`new Texture({ source, frame: new Rectangle(...) })`).
**Code deleted:** none; ~60 lines added.

On the packer: every frame here is a whole number of 24 px cells, so a fixed-grid shelf packer is trivial
and deterministic (~40 lines) and Pixi already provides the spritesheet _loading_ side. Recommendation:
write the grid packer ourselves rather than add a packing dependency that would first have to pass the
maintenance criteria. **Medium confidence** because this is the one option whose benefit is argued from
architecture rather than measured — on localhost the 251 requests cost little, and the draw-call saving
needs a profile to quantify.

### 4. Aseprite or TexturePacker as the source of truth — reject

**Gain:** an industry-standard authoring format with animation metadata and a mature exporter.
**Lose:** the art here is **generated**, not hand-drawn: the deliveries in `assets/inbox` come from an image
generator at roughly 1024 px and are trimmed, scaled and aligned by the importer. There is no Aseprite
document to be the source of truth, and introducing one would mean hand-editing generated art.
TexturePacker is additionally proprietary at the useful tiers.
**Verdict:** reject — it solves a problem this project does not have.

### 5. Stop committing `assets/src` and regenerate it in CI — reject

**Gain:** ~250 fewer tracked PNGs.
**Lose:** the imported frames are the _reviewed_ art. `assets:import` involves human judgement per sprite
(`--crop`, `--like`, `--cells`, `--frames`, `--no-align`), recorded in the `import.json` sidecars but not as
a reproducible command list. Regenerating in CI would mean re-deriving those decisions, and the first
non-determinism in the generator or in a resize would silently change the office's appearance.
**Verdict:** reject. Committing reviewed art is correct for a product whose art is its substance.

## Recommendation

1. **Keep** the inbox → import → manifest pipeline and the `--like` sidecar mechanism; it encodes knowledge
   that would be expensive to rediscover.
2. **Move** `crop`, `place`, `opaqueBounds` and `splitStrip` onto `sharp` (already a dependency, exact
   operations, ~80 lines deleted). **Keep** the hand-written premultiplied `resample` and record why in
   `docs/OFFICE-ART.md`, so the next reader does not "simplify" it away.
3. **Add** a deterministic fixed-grid atlas using Pixi's spritesheet loading and a ~40-line packer of our
   own, replacing 251 texture loads with a handful. Do it after the Wave 3/4 work and measure the
   draw-call change rather than asserting it.
4. **Do not** re-import existing art in this audit. The 306 tracked PNGs stay byte-identical.

## Revision after Wave 3 (2026-09-09)

The decision to "move exact raster ops to `sharp`" is **withdrawn**, on evidence rather than taste. A probe
compared both implementations byte for byte on delivered sprites: `extract` equals our `crop` and `extend`
equals our `place` exactly, but `trim` does not equal `opaqueBounds` — sharp trims by colour distance from a
background, ours by `alpha ≥ 16`, and on real sprites the two disagree by a row (85×118 or 85×116 versus
85×117; 14×13 versus 14×14). Since the two equivalent ops are chained synchronously with `resample`, which
stays hand-written, adopting sharp there would only trade exact `subarray` copies for async plumbing.

`sharp` keeps the job it is better at — decoding and encoding PNG — and the atlas recommendation is
unaffected. Details and the numbers are under B16.1 in `AUDIT.md`.
