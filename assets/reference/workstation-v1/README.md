# DEV 3 calibration sample

Generated with the built-in imagegen tool on 2026-09-06, using `../office-base-v1.png` as the style reference. `sheet.png` is the unchanged selected source. It is 1254×1254, despite the requested 1024×1024; its four equal cells are imported by the native workstation script. The first generation rendered a checkerboard instead of alpha, so the selected edit uses a magenta import key. The importer removes magenta including dark edge fringes.

The original downsampled comparison frames remain under `sample-*-v1` and can be regenerated with `bun run assets:workstation`. The native path is `bun run assets:workstation:native`: it chroma-keys and trims the desk, chair and seated source cells without resampling, producing the `v2` textures used by Office Lab. Their dimensions are determined by the source artwork; PixiJS applies per-object presentation scales. The carpet remains a repeated tile sample. The occupied chair/person is one static calibration pose, not a finished character animation set.

The sample replaces only DEV 3 visually. Collision bounds and anchors stay unchanged. The desk visual origin is (472,96), sorting baseline 143; both empty and occupied chairs are centred at (504,160), with empty-chair baseline 159. Occupancy swaps the empty chair for the seated pose, reverting on departure. Other actors continue to use normal Y sorting.

## Initial prompt

Use case: stylized-concept. Asset type: production pixel-art sprite sheet for a PixiJS office game. Reference image is ONLY a style/palette reference; generate isolated reusable assets, not the office scene.
Create a 1024x1024 PNG with genuine transparent background, arranged as exactly 2 columns and 2 rows of 512x512 equal cells, no gutters, no labels, no borders. Everything is aligned to one crisp 128x128 logical pixel grid enlarged exactly 8x with nearest-neighbor square pixels. Top-down oblique orthographic camera looking from south, horizontal desk edges (not isometric diamonds). Warm honey wood, dark outline, teal upholstery, muted blue screen, matching reference but clean deliberate pixel clusters.
Top-left cell: one developer desk facing north, viewed from south, width 56 logical pixels, height 42 logical pixels, centered at logical cell (32,32); warm wooden tabletop, legs, drawer on right, large monitor along north/back edge showing tiny blue code lines, keyboard centered along south edge, mouse, white mug and small potted plant on left. NO chair, NO person, NO carpet.
Top-right cell: empty teal office chair viewed from behind, facing north toward a desk. Seat, backrest, armrests, five-star base. Width 22 logical pixels, height 28 logical pixels, bottom at logical y=48 of its cell, horizontally centered. No person.
Bottom-left cell: seated developer viewed from behind facing north, brown short hair, blue hoodie, hands reaching forward at keyboard height; NO chair or desk baked in. Width 20 logical pixels height 30 logical pixels, bottom at logical y=48, centered. Transparent space around silhouette.
Bottom-right cell: square teal carpet material tile, fill the entire cell edge to edge, subtle 3-tone woven pixel texture, seamless all edges, no border and no objects. This cell opaque; all other cells genuine alpha outside objects.
Every object fully contained in its own cell. No shadows outside object footprint. No fake transparency checkerboard. No text/watermark.

## Selected edit prompt

Edit this sprite sheet only: replace ALL white/light-gray checkerboard background surrounding the three objects with perfectly flat solid pure magenta #FF00FF, no texture, no shading or gradients. Keep the carpet bottom-right square unchanged. Keep exact positions, framing and pixelated art of desk and seated developer with chair unchanged. Change the empty chair top-right to a REAR view of the SAME dark charcoal chair seen under the seated developer bottom-left, with its low backrest and five-star base, matching width. No checkerboard anywhere except carpet texture. Output a square 1024x1024 sheet, four equal512x512 cells; crisp pixel art. Magenta is a technical chroma key background, must be exactly RGB255,0,255.
