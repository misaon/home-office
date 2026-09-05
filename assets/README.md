# Assets

Pixel-art sources for the office, in the LimeZu _Modern Office_ style: **16×16 tiles**, top-down, PNG with alpha, rendered at 3× in the app. The owner generates sprites with AI tools; this folder defines the contract so generated files drop in without code changes.

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
- Tiles and small props: 16×16. Large furniture: multiples of 16 (e.g. 32×16 desk, 32×32 sofa).
- Emotion bubbles: 16×16.

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

The UI loads textures per file (PixiJS batches up to 16 textures per draw call, plenty for this scene); atlas packing is a later optimisation, not a prerequisite.

## Attribution

LimeZu assets themselves are **not** committed here (their license forbids redistribution). Only original or AI-generated sprites in the same style live in this folder.
