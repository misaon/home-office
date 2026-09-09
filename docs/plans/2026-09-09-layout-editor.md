# Plan — the internal office editor

Owner instruction, 2026-09-09: an internal tool mode, local only, where the owner draws an office —
walls and rooms on the grid, plus doors — and a Save button writes a JSON that represents the layout,
so as many offices as wanted can be drawn. Minimal graphics for now: **a wall drawn today must pick up
the wall sprite added later.**

## Owner decisions

| Decision     | Chosen                                                                                         | Rejected                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Availability | Dev build only (`bun run ui:watch`), opened in the UI or with `?editor=1`                      | Shipped behind a flag; a separate `/editor.html` entry                       |
| Saving       | A dev-only RPC writes `layouts/<id>.json` in the repo and the daemon serves them back          | A browser download moved by hand; the daemon's state directory (unversioned) |
| Tools        | Walls, rooms, doors, eraser, office name and size, Save                                        | Walls and doors only; also objects (no object catalogue exists yet)          |
| Room types   | A fixed list: reception, boss-office, team-room, meeting, kitchen, restroom, corridor, terrace | Free text (nothing would tie a drawn id to the simulation or the art)        |

## Why a sprite added later applies by itself

The JSON never stores a colour. It stores **what a cell is**: `wall` with a material id, `room` with a
room kind, a door as its own kind. The view maps those ids to something drawable — today a flat colour
from `palette.ts`, tomorrow a sprite — so the office drawn now gains art the day the art lands, without
touching the file. That is the whole reason the model keeps material ids open strings.

## The shape of a saved office

```json
{
  "id": "hq-ground-floor",
  "name": "HQ ground floor",
  "width": 60,
  "height": 34,
  "walls": [{ "x": 4, "y": 3, "w": 22, "h": 1, "material": "wall" }],
  "rooms": [{ "x": 5, "y": 4, "w": 20, "h": 8, "room": "team-room" }],
  "doors": [{ "x": 12, "y": 3, "kind": "door" }]
}
```

Validated with Zod at the RPC boundary in both directions. `id` is a strict slug, so it can only ever
name a file inside the layouts directory.

## How it fits what already exists

- `@ho/protocol` gains the `OfficeLayout` schema and a `layouts` group on the contract: `list` and
  `save`.
- `@ho/daemon` reads and writes `<repo>/layouts/*.json`. A packaged app has no repository, so the
  directory is absent and both calls answer that the editor is unavailable — which is what keeps this a
  local tool even if the code were shipped.
- `@ho/sim` converts a saved office into the `Layout` it already compiles: the whole map becomes floor,
  walls and rooms map across, and **a door becomes a non-blocking object on its wall cell** — the
  compiler already treats that as passable, which is exactly what a door is.
- `@ho/ui` gets `src/editor/`, compiled into the dev bundle only (`process.env.NODE_ENV` is replaced at
  build time, so the production bundle cannot contain it). It reuses the office's own `Camera`,
  `gridLines` and tile painters: the draft is compiled on every edit and drawn like any floor, so what
  is drawn is what the office will show.

## Tools

Dragging paints on the grid, as in Prison Architect: a rectangle for walls (a one-cell-wide drag is a
line), a rectangle for a room's designation, a click for a door on a wall cell, and the eraser clears
whatever a cell holds. The toolbar carries the room kinds, the office's name and size, Save, and the
list of saved offices to load one back for editing.

## Out of scope

Objects (no catalogue yet), anchors and the spots characters use (the drawn office has none yet, so the
app's floors keep using the code-authored `empty-office` until anchors can be drawn too), and art.

## Verification

`bun run check` passes. The gate was measured rather than trusted: with `NODE_ENV` alone the production
bundle still carried the editor (`Office editor`, `Save office`, `Shift-drag`, `ho-editor-kind` all
found), so `ui-build.ts` now resolves the module to a stub for production builds — after which all four
markers are absent and the bundle drops 1024 → 1011 KiB, while the dev bundle still contains it.

The editor was then driven in a real browser against a running daemon: a room dragged over 11,6–24,14,
four walls around it, and a door clicked at 18,5.

```
draft            60 × 34 cells · 20 wall runs · 9 room runs · 1 doors
saved            /Users/…/home-office/layouts/hq-ground-floor.json
first wall run   { "x": 10, "y": 5, "w": 16, "h": 1, "material": "wall" }
first room run   { "x": 11, "y": 6, "w": 14, "h": 1, "room": "team-room" }
door             { "x": 18, "y": 5, "kind": "door" }
```

Read back off disk, parsed with the schema and compiled:

```
compiled     50 wall cells, 126 room cells (14 × 9), 49 blocked of 2040
wall  (10,5) wall=wall  object=null    walkable=false
door  (18,5) wall=wall  object=door-1  walkable=true     ← the door opens its own wall cell
room  (12,7) room=team-room            walkable=true
floor (40,20) nothing                  walkable=true
```

Reloading the editor showed `0 wall runs · 0 room runs · 0 doors`, and loading the saved office from the
list brought back `20 wall runs · 9 room runs · 1 doors` with its id and name — the round trip closes.

Two bugs turned up while testing and were fixed: `resolveToken` wiped the query string along with the
token fragment (so `?editor=1` never survived a launch URL), and the editor asked the daemon for its
layouts before the socket was up. The office drawn for this test was deleted rather than committed; the
directory is created on the first save.

## The owner's notes, 2026-09-09 (second pass)

| Note                                                                  | Built                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop the Erase tool; erase by right-dragging the same way one paints  | The tool row is Wall / Room / Door / Furniture. The left button paints, **the right button erases** the same rectangle, the middle button or shift pans. The preview turns red while erasing.                                             |
| The file name is read-only and follows the office name as it is typed | The `File` field shows `layouts/<slug>.json`, is `readOnly`, and is re-slugified on every keystroke of the name                                                                                                                           |
| A door is 1×4 cells, not 1×1                                          | A doorway spans four cells **along the wall it is cut into** — the editor looks at the neighbouring cells and lays it out horizontally or vertically. Four wall cells in a row are required; otherwise the click is refused with a reason |
| Furniture: plant 2×2, desk 3×6, chair 2×2                             | A `Furniture` tool with those footprints, a `Rotate` button that swaps them (a desk goes 3×6 or 6×3) and refusals for a wall or another object in the way                                                                                 |

### What Prison Architect actually uses, and why ours is finer

Read from the Paradox wiki, 2026-09-09: [office desk](https://prisonarchitect.paradoxwikis.com/Office_Desk)
"Size: 2x1", [bed](https://prisonarchitect.paradoxwikis.com/Bed) "Size: 2x1",
[chair](https://prisonarchitect.paradoxwikis.com/Chair) "Size: 1x1",
[door](https://prisonarchitect.paradoxwikis.com/Door) "Size: 1x1".

So Prison Architect's tile is about a metre and its furniture is one or two tiles. The owner's sizes are
two to three times finer, and they are consistent at **roughly 25 cm per cell**: a 3×6 desk is 75 × 150
cm, a 2×2 chair and plant are 50 × 50, and a 1×4 doorway is a metre wide. Two consequences worth stating
rather than discovering later: the 60×34 floor is then **15 × 8.5 m** (127 m²), and the character dot —
0.9 of a cell across, or 22 cm — was too small for a person beside 50 cm furniture, so it now spans 1.8
cells (about 45 cm).

### Measured

The editor was driven in a browser again. Typing "HQ Ground Floor" as the name produced
`layouts/hq-ground-floor.json` in the read-only field. Four walls, two doorways, three pieces of
furniture and one right-drag erase later, the file holds:

```
doors    [{ x:18, y:5, w:4, h:1 }, { x:10, y:10, w:1, h:4 }]      ← along the wall each was cut into
objects  [{ desk 3x6 at 13,8 }, { desk 6x3 at 20,8 }, { chair 2x2 at 13,15 }]
walls    the top row is two runs — 10..25 and 30 — where the right-drag punched its hole
```

A door placed on a floor cell was refused: `a doorway needs 4 wall cells in a row`. The right-drag over
the plant removed it (4 → 3 furniture) and cleared the wall cells it covered. Compiled:

```
door  (18,5) wall=wall kind=door  walkable=true      door  (21,5) wall=wall kind=door  walkable=true
wall  (17,5) wall=wall kind=-     walkable=false     door  (10,13) wall=wall kind=door walkable=true
desk  (13,8) wall=-    kind=desk  walkable=false     chair (13,15) wall=-   kind=chair walkable=true
```

The `objectKind` layer is what carries `door`, `desk` and `chair` into the view, so the sprite added
later applies by kind. A chair does not block movement — it is sat on — while a desk and a plant do.

One more bug turned up: the daemon served `index.html` with `cache-control: no-cache` and no validator,
so a rebuilt UI could keep serving the previous bundle (the editor appeared to be missing entirely).
The HTML entry is now `no-store` and the content-hashed assets are `immutable`, both verified with
`curl -I`.

## The owner's notes, 2026-09-09 (third pass)

| Note                                                                                                   | Built                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load an existing office (JSON) and edit it                                                             | The saved list already loaded offices from the repository; a `Load an office from a JSON file` field now accepts one from anywhere, parsed with the schema and reported by its own message when it does not fit |
| Furniture is placed by a click, not a drag, with the footprint shown first; a key rotates what is held | The furniture tool draws its footprint under the cursor and places on the click. **R** rotates 90°, as in Prison Architect, unless a field has the keyboard                                                     |
| Objects and rooms carry their name in the middle of the shape                                          | One label per placed object and doorway, and **one per contiguous room area** rather than per row, drawn at a constant size whatever the zoom                                                                   |
| Right-drag erases only what the active tool paints                                                     | `erase(draft, tool, rect)`: the room tool clears designations and leaves walls standing, the wall tool clears walls, the door and furniture tools remove their own                                              |

### Measured

```
labels        two separate team-room areas → two labels, at (5,4) and (22,4); kitchen at (6,13.5);
              a 3×6 desk placed at 15,10 → its label at (16.5,13); a 2×2 chair at 25,12 → (26,13)
furniture     a plain click places it; R turns "3 × 6 cells" into "6 × 3 cells" and the next click
              lands the rotated piece
erase         wall 6 runs + room 6 runs over the same area: right-drag with the room tool → rooms 0,
              walls still 6; right-drag with the wall tool → walls 0, furniture untouched
load a file   a JSON with two walls, a room, a doorway and a plant came back as 40 × 24 cells, 11 wall
              runs, 5 room runs, 1 door, 1 furniture, with the name and file field following it;
              a malformed one answered "Too small: expected string to have >=1 characters"
```

Two bugs fell out of this pass. **The first drag after opening the editor did nothing**: the scene is
built asynchronously and the effect that handed it the paint callback had already run against a null
scene, so the callback only arrived with the next re-render. It is now handed over inside the scene's
own initialisation, through a ref. And `bun run check` finishes with a production `ui:build`, which
replaces the development bundle the editor lives in — the editor then vanishes until the watcher
rebuilds. That trap is now written down in [AGENTS.md](../../AGENTS.md).

## The owner's notes, 2026-09-09 (fourth pass)

| Note                                                                                            | Built                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| The right button does not rotate the piece in hand                                              | It was bound to **R**, because "tlačítko" was read as a key. A **right click** now turns the piece a quarter; a right **drag** still erases       |
| Doors work exactly like furniture, with an arrow through the middle showing which way they open | Doors are placed by a click with their footprint shown first, carry a `facing`, and draw the same arrow the directional furniture does            |
| Twenty-six pieces of furniture, the plain office desk dropped                                   | `OBJECT_SPEC` in the protocol is the one table: footprint, whether it blocks movement, whether it mounts on a wall, whether its direction matters |

### The catalogue, at roughly 25 cm per cell

Sizes are derived from the real pieces and stated so they can be argued with. `walkable` means movement
goes through it (a chair is sat on, a window looked through); `on-wall` pieces are mounted on a wall
cell and leave the wall standing, unlike a door, which opens it.

```
elevator            8x8 walkable arrow      kitchen-counter     4x3 blocks arrow
desk-developer      6x3 blocks arrow        fridge              3x3 blocks arrow
desk-qa             6x3 blocks arrow        coffee-machine      2x2 blocks arrow
desk-analyst        6x3 blocks arrow        grill               5x2 blocks arrow
desk-boss           8x4 blocks arrow        hot-tub             8x8 blocks
reception-counter  10x3 blocks arrow        bookcase            3x2 blocks arrow
meeting-table      12x5 blocks              plant               2x2 blocks
office-chair        2x2 walkable arrow      picture             3x1 walkable on-wall arrow
lounge-chair        3x3 walkable arrow      air-conditioning    4x1 walkable on-wall arrow
dining-table        6x4 blocks              window              5x1 walkable on-wall
dining-chair        2x2 walkable arrow      toilet              2x3 blocks arrow
                                            sink                2x2 blocks arrow
                                            hand-dryer          1x1 walkable on-wall arrow
                                            bin                 2x2 blocks
                                            standing-ashtray    1x1 blocks
```

The elevator is the arrival point staff will spawn at; it is a piece of furniture for now, because a
drawn office still has no anchors — wiring it to the simulation's spawn is the step that turns a drawn
office into a floor.

### Measured

```
catalogue     26 kinds; the plain "desk" is gone, the desks are per role
rotation      facing s (6 × 3) → right click → w (3 × 6) → right click → n (6 × 3)
right drag    erased the placed piece (1 → 0 furniture) and left the facing alone
doors         a click on a wall placed one, a right click turned it n → e, a second click placed
              another: "1 wall runs · 2 doors"
wall rules    a window off a wall: "a window is mounted on a wall"; on the wall: placed;
              a plant on a wall: "furniture cannot stand in a wall"
arrows        3 for one doorway and two desks (the meeting table and the plant have no direction)
```

## The owner's notes, 2026-09-09 (fifth pass): doors

Reported: doors had no arrow, could not be placed, and the right button did not turn them in space. Two
real causes, measured on the owner's own office (`layouts/base.json`, 142 wall runs):

1. **The footprint ignored the facing.** The door's orientation was guessed from the neighbouring cells,
   so the right button changed only the arrow while the shape stayed put — and at a junction the guess
   was wrong. A doorway now lies across the way it opens: facing north or south it spans four cells of a
   horizontal wall, east or west four cells of a vertical one, exactly like a piece of furniture turning.
2. **The doorway started at the click.** Anywhere in the last three cells of a wall run there was no
   room left, and the click was refused:

```
a door starting at the click fits on 329 of 381 wall cells (86%)
one allowed to slide back over the click fits on 379 of 381 (99%)
```

It now slides along the wall, preferring the position centred on the click, and the ghost shows the
position it will actually take.

Driven on the owner's office in a browser: loading Base gave 0 doors; a click at the very end of the top
wall (59,0) placed one at 56,0 (it used to be refused); a right click turned the tool to facing `w`; a
click on the vertical wall at (11,4) placed the second. The arrow reads
`{"x":21,"y":0.5,"dx":0,"dy":1}` for a 4×1 door at 19,0 — centred, pointing the way it opens.

The pale blue region in the owner's plan was not a bug: 28 of their 142 wall runs are `glass`.

## The owner's notes, 2026-09-09 (sixth pass): the doorway placeholder and openings

Reported: the placeholder shows no arrow, and clicking a 4×1 doorway _between_ walls does nothing.

The second is the important one. The office is drawn with **openings left in the walls** — the owner's
own vertical wall reads `###########....#.................#` down its column — and a doorway was
required to sit on four cells of wall, so a click into the opening was refused. A doorway now goes
wherever it is clicked: over wall cells, which it opens, or into the gap between two walls, which is how
an office is actually drawn. Only a doorway that touches no wall at all says so, as a note rather than a
refusal. Every one of the 2040 cells now accepts the click.

The placeholder draws the arrow too, so the direction is visible before the click:

```
facing n: ghost 10,12 4x1 → arrow at 12,12.5 pointing 0,-1
facing e: ghost 11,11 1x4 → arrow at 11.5,13 pointing 1,0
facing s: ghost 10,12 4x1 → arrow at 12,12.5 pointing 0,1
facing w: ghost 11,11 1x4 → arrow at 11.5,13 pointing -1,0
placed  : {"x":11,"y":11,"w":1,"h":4,"facing":"w"} → arrow {"x":11.5,"y":13,"dx":-1,"dy":0}
```

While chasing large grey triangles across the map in screenshots, the arrow was rebuilt as its own
display object per arrow (a stem rectangle and a head polygon) rather than shapes appended to a shared
`Graphics`. **The triangles turned out to be an artifact of a hidden Browser pane** — they did not change
by a pixel across three different drawing implementations, which is what gave them away. Screenshots of
a hidden pane cannot be trusted; the geometry above is measured instead.

## The owner's notes, 2026-09-09 (seventh pass)

| Note                                   | Built                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| The lift takes too many cells          | 8×8 → **6×6** (1.5 × 1.5 m at 25 cm per cell): 36 cells instead of 64                                  |
| Every room needs its own tint          | A hue per kind, eight distinct ones, and the tint went from 0.16 to 0.22 alpha so they read over white |
| A room's name must sit inside its area | The label takes the **deepest cell** of the area, not the middle of its bounding box                   |

### Why the bounding box was wrong, measured

A corridor filling 2,2–18,14 with a team room cut out of its middle at 5,5–15,11:

```
corridor  label at 3.5, 3.5   → the cell under it is "corridor"
team-room label at 7.5, 7.5   → "team-room"
the bounding-box centre would be 10, 8 → "team-room"   ← the corridor's name inside another room
```

An L-shaped kitchen (2,2 4×14 plus 2,12 16×4) labels itself at 4.5, 12.5 — inside the kitchen, where
its two arms meet. Depth grows inward from the edge of an area by breadth-first search and the label
takes the deepest cell, which is inside the shape by construction.

Room tints: reception `#e0a33c`, boss-office `#8b6fd0`, team-room `#4c8bf5`, meeting `#2fae9e`, kitchen
`#e0603c`, restroom `#3cb4e0`, corridor `#9aa2b1`, terrace `#5fae4c` — eight distinct colours for eight
kinds.

## The owner's notes, 2026-09-09 (eighth pass)

| Note                                  | Built                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Doors down to 2×1                     | `DOOR_SPAN` 4 → **2** — 50 cm, exactly one employee wide                                                    |
| An employee is 2×2 and walks in cells | The dot is two cells across (radius one cell), the width of the chair they sit on and the doorway they pass |
| The lift hangs on a wall, 5×2         | `elevator` is `onWall`, 5×2, walkable — and wall-mounting learned to work on a one-cell wall                |

### What "on a wall" had to become

`onWall` meant _every_ cell of the footprint had to be wall, which is right for a 4×1 air conditioner
but impossible for a 5×2 lift car on a wall one cell thick. A wall-mounted piece now puts the **row at
its back** — the side opposite the way it faces — on the cell clicked, and grows in the facing
direction:

```
lift 5x2, clicked on a horizontal wall at 8,5 opening south → placed 8,5 5x2
                                             opening north → placed 8,4 5x2
lift 5x2, clicked on a vertical wall at 5,10 opening east   → placed 5,10 2x5
                                             opening west   → placed 4,10 2x5
lift clicked out in the room                                → "elevator hangs on a wall — click the wall itself"
air conditioning 4x1 on the wall at 14,5 blowing south      → placed unchanged
doorway facing s → 2x1 · facing e → 1x2
```

Still open, and worth saying plainly: the simulation moves an actor one cell at a time, so a 2×2 body is
not yet reserved by the path search. A two-cell doorway is exactly one employee wide, which only means
something once the search knows the body's size — that is part of wiring a drawn office into a floor.

## The owner's notes, 2026-09-09 (ninth pass)

| Note                                                      | Built                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Rooms need a faint border so their end is visible         | Every cell edge where the room changes is drawn in the room's own hue, at 0.75 alpha and 0.09 of a cell wide   |
| Rooms for toilets, QA, analysts and developers            | `restroom` became **toilets**, and `office-developers`, `office-qa`, `office-analysts` joined it: eleven kinds |
| Tabs instead of buttons, and the items in a 3-column grid | The tool row is tabs; the kind picker is a grid of the items themselves, three to a row, with footprints       |

### The outline, measured

Drawing per cell edge rather than per rectangle is what makes an L-shaped room read as one room:

```
toilets 5x3 rectangle                            16 edges   = 2 × (5 + 3)
office-qa, 6x3 plus 3x4 sharing three cells      26 edges   = 2 × (6 + 3) + 2 × (3 + 4) − 2 × 3
office-developers 2x2                             8 edges
```

The shared edge between the two rectangles of the L is dropped, and no edge is degenerate. The geometry
lives in `packages/ui/src/office/room-outline.ts`, free of Pixi, which is why it can be measured at all.

### The palette, in the browser

```
tabs        Wall · Room · Door · Furniture
grid        97.33px 97.33px 97.34px — three columns in a 360 px sidebar
rooms       11 items: reception, boss-office, office-developers, office-qa, office-analysts,
            team-room, meeting, kitchen, toilets, corridor, terrace
furniture   26 items, each with its footprint: "elevator 5×2 wall", "desk-developer 6×3", …
```

## A file the owner had already drawn, broken by a rename (2026-09-09)

Loading `base.json` failed with `Invalid option: expected one of "reception"|…|"terrace"`. Renaming the
`restroom` room to `toilets` in the previous pass changed a value inside a closed list that the owner's
own file already used — a saved office is data made by hand, and there was no migration for it.

Reading now maps names that have been renamed, and writing uses the new one:

```
restroom → toilets            (the room)
desk     → desk-developer     (the plain office desk that was dropped)
chair    → office-chair
```

Measured on the owner's file:

```
parses            152 wall runs · 70 room runs · 11 doors
rooms after read  boss-office 9 · corridor 14 · reception 6 · meeting 8 · kitchen 8 · terrace 17 · toilets 8
labels            7 room areas
saving writes     boss-office, corridor, kitchen, meeting, reception, terrace, toilets — no "restroom"
old doorways      all 11 keep their 4×1 width; only new ones are 2 cells
```

The lesson worth keeping: the schema is a boundary over the owner's own data, so a value that has been
written to disk cannot simply be renamed in the enum.

## The owner's notes, 2026-09-09 (tenth pass)

| Note                                      | Built                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Quick search in the item palette          | A search field per tab, filtering by name, with a "4 of 26" count and a line when nothing matches; it empties when the tab changes |
| Two columns instead of three              | `grid-cols-2` — 149 px per column in the 360 px sidebar, so the longer names fit on one line                                       |
| The boss's desk is the size of the others | `desk-boss` 8×4 → **6×3**, the same 160 × 80 cm as the team's                                                                      |
| The reception counter is shorter          | 10×3 → **8×2** (2 × 0.5 m)                                                                                                         |
| A smaller meeting table                   | 12×5 → **6×4** (1.5 × 1 m)                                                                                                         |
| Clear the rooms from the owner's office   | `layouts/base.json` keeps its 153 wall runs, 10 doorways and 11 pieces of furniture; its 110 room runs are gone                    |

Measured in the browser: the office loads as `60 × 34 cells · 153 wall runs · 0 room runs · 10 doors ·
11 furniture`; the grid reports `149px 149px`; searching "desk" leaves `desk-developer 6×3`,
`desk-qa 6×3`, `desk-analyst 6×3`, `desk-boss 6×3` and the count `4 of 26`; "zzz" answers
`nothing matches "zzz"`; and the field is empty again after switching to the Room tab, which lists 11.

None of the owner's eleven placed pieces is one of the three that were resized (six developer desks, two
QA, two analyst, one lift), so nothing in the file renders at a stale size — a saved piece keeps the
footprint it was placed with.
