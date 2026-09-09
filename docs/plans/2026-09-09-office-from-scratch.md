# Plan — the office, designed again from scratch

Owner instruction, 2026-09-09, in two steps: first "delete all sprites so there is only a white surface
with round dots for the agents", then "you may delete all the original sprites, the rooms, simply
everything — we keep only the movement of the employees, who will be dots on a white surface. We will
build the whole game mechanic from the beginning, following further instructions."

## What was deleted

| Gone                                                                                                                       | Why it went with it                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `assets/` — 306 PNGs, 48 MB: characters, furniture, tiles, bubbles, reference, inbox                                       | The art itself                                               |
| `scripts/assets-{import,manifest,placeholders}.ts`, `scripts/lib/{import-target,manifest,raster}.ts`                       | Nothing left to import, size or list                         |
| `packages/sim/src/office-{plan,builder,decor,anchors,audit}.ts`                                                            | Rooms, furniture, doors, glazing, decor and the layout audit |
| `packages/ui/src/office/{sprites,plan-view,architecture,walls,stand-ins}.ts`                                               | The sprite library and every painter that used it            |
| `docs/OFFICE-ART.md`, the `/assets/` route, `ui.assetsDir`, the CI manifest step, `@ho/sim`/`zod` at the root, `decodePng` | Everything that only existed to serve or produce art         |

Sharp stays: the desktop app icon is still drawn with it.

## What remains

- **The plane.** `packages/sim/src/plane.ts` — 48×28 cells, every cell walkable, `CELL_PX` now only the
  unit positions are expressed in. It carries 29 named spots so the existing movement keeps working: the
  lift car and door, the entrance, the reception (`reception-staff`, where the roster settles Lola), a
  mailbox, a boss desk (reserved for the boss), twelve seats, coffee/restroom/smoke/relax/sleep and six
  stroll targets.
- **The movement.** Grid A*, reservations, needs, idle behaviour, the elevator, handoffs and the envelope
  choreography are untouched — that is what the owner asked to keep.
- **The renderer.** `packages/ui/src/office/scene.ts` is a white surface and one `Graphics` circle per
  character: 0.45 cells in radius, dark on white, the selected one in accent, click to select, and the
  same camera as before (the plane spans the pane's width and the pane scrolls when it is taller).

## Verification

`bun run check` passes (16 compiler targets, type-aware oxlint, oxfmt, knip, the UI build: 1123 → 1004
KiB). Read out of the live scene in the browser against a running daemon:

```
background   #ffffff
floor        48x28 anchors=29
actors       receptionist (9, 14) idle · boss (42, 5) idle
dots         Graphics (228, 348) · Graphics (1020, 132)      = ((x + 0.5) · 24, (y + 0.5) · 24)
```

## Next

The mechanic is the owner's to specify. Until those instructions arrive: no art, no rooms, no furniture
— build on the plane and the dots.
