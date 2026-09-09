# Plan — the grid system of the map

Owner instruction, 2026-09-09: "First we build the grid system in the map. We will then place objects,
walls and more into these squares. Exactly the way Prison Architect does it (look the game up online and
verify its mechanics) — I want it very similar." Asked about scope, the owner added the constraint that
matters most: **the player never builds anything.** Layouts are composed by us in code, finished, and in
the future there can be several — per floor, or an office the user picks from a list.

## Prison Architect, verified rather than assumed (read 2026-09-09)

| Mechanic                                                                                                                                                                                                                                                                                                                 | Source                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| The square tile is the basic building block of the map                                                                                                                                                                                                                                                                   | [Steam guide](https://steamcommunity.com/sharedfiles/filedetails?id=533324411) |
| **Walls occupy whole tiles**: a 4×4 room needs a 6×6 foundation, "this accounts for the four walls at the edges taking up floor space"; foundations are at least 2×2, drawn corner to corner, and produce floor, perimeter walls and lights every 4 rows and columns; joining foundations demolish the overlapping walls | [Foundation](https://prisonarchitect.paradoxwikis.com/index.php/Foundation)    |
| Rooms are a **designation painted over floor tiles**, drawn as a coloured chessboard overlay with the room's name; they must be enclosed and indoors, with minimums in tiles (cell 2×3, office 4×4, workshop 5×5, chapel 6×6)                                                                                            | [Rooms](https://prisonarchitect.paradoxwikis.com/Rooms)                        |
| Planning draws non-physical guides — lines for walls, squares for rooms, a foundation fill above 2×2                                                                                                                                                                                                                     | [Planning](https://prisonarchitect.paradoxwikis.com/index.php?title=Planning)  |
| Utilities are their own overlay layer (cables, pipes) with a radius of effect                                                                                                                                                                                                                                            | [Utilities](https://prisonarchitect.paradoxwikis.com/Utilities)                |

What carries over: the tile is the atom, **a wall is the content of a cell** (not an edge), floors are
per-cell, objects have a tile footprint, and a room is a designation over cells. What does not carry
over: foundations, planning, budgets and every build tool — those exist for a player who builds.

## Owner decisions

| Decision       | Chosen                                                                                                                                                        | Rejected                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walls          | A wall occupies a whole cell, as in Prison Architect                                                                                                          | Walls on cell edges (cheaper floor space, but a second geometry to model and un-PA-like)                                                                                                 |
| Map and camera | The map **is** the office, fixed at 40×34 cells so it fits the pane without scrolling; the wheel still zooms and dragging still pans, for looking at one room | A large 100×70 map with the office as a patch inside it (built first, then withdrawn by the owner — it left the floor standing in an empty field); a medium map with zoom but no panning |
| Grid           | Always visible: a fine line, a stronger one every 8 cells                                                                                                     | Only while a tool is active (there are no tools — the grid is the map's own structure)                                                                                                   |
| Authoring      | **Layouts are written in code**, several of them, selectable                                                                                                  | A player-facing builder with placement tools (explicitly not wanted)                                                                                                                     |

## The model

```
Layout (authored in code)                 TileMap (compiled once per floor)
  id, name, size                            per cell: floor | wall | object | room
  floor rects        ──compile──▶           typed arrays, one index per cell
  wall rects/lines                          derived collision Grid (void, wall, blocking object)
  objects (footprint, facing)                 └─ what A*, reservations and needs already use
  room rects (designation)
  anchors (the spots characters use)
```

- `packages/sim/src/layout.ts` — the `Layout` authoring types, the compiled `TileMap`, and the
  collision `Grid` derived from it. Walls, void and blocking objects are impassable; floors are not.
- `packages/sim/src/layouts.ts` — the registry: `layoutFor(id)`, so a floor can be given a different
  layout later without touching the simulation.
- `FloorTemplate` becomes `{ id, name, map, anchors }`: a floor is a compiled layout plus its spots.

## The view

- **Camera.** The canvas fills the pane. The wheel zooms around the cursor, dragging pans, and the map
  is clamped so it cannot be lost off-screen. **Zooming out stops with the whole floor in view** — the
  floor is sized to fit, so there is nothing further back to see — and zooming in reaches 64 px per
  cell. The pane itself never scrolls.
- **Grid.** A 1 px line on every cell boundary and a stronger line every 8 cells, drawn once per zoom
  level, plus the map's own edge. Cells outside the office footprint are void and read as a lighter
  ground, so the office's shape is visible without a single sprite.
- **Layers, in order:** ground → floors → room designation → walls → objects → characters (the dots).
  Only the layers a layout fills actually draw anything, which is what makes "we then place objects,
  walls and more into these squares" a data change rather than a renderer change.

## Out of scope, deliberately

No build tools, no cursor placement, no foundations, no planning mode, no budgets — the owner composes
layouts in code. The office layout content itself (which walls, which rooms, which objects) arrives as
the next instruction; this step only has to make placing them a matter of data.

## Verification

`bun run check` passes. Read out of the live scene in a browser against a running daemon:

```
pane     1000 x 847 px   ratio 1.181      (1440 x 900 window, 440 px panel, 53 px bar)
map      40 x 34 cells   ratio 1.176      world 960 x 816 px
layers   floor 1360  wall 0  object 0  room 0        (1360 = every cell of the map)
blocked  0                                           (no void and no walls yet: all of it walkable)
anchors  29
```

The camera was driven directly against that pane:

```
fit()                    → 24.91 px/cell, offset (-1.7, 0)   fills the height, centred across the width
zoomBy(0.001, 0, 0)      → unchanged at 24.91: it cannot be pulled back past the whole floor
zoomBy(1000, 500, 400)   → clamped to 64 px/cell (a 6x6 room across 384 px)
panBy(-9999, -9999)      → clamped to (585, 498.4) = 960 - 1000/2.667, 816 - 847/2.667
fit()                    → exactly back to 24.91, (-1.7, 0)
```

The earlier 100×70 map and its centred 48×28 office patch were measured the same way before the owner
replaced them with fixed office dimensions; the numbers above are the ones that ship.

Walls, objects and rooms read 0 because no layout declares any yet — which is the point of the step: the
next instruction is data, not renderer work.
