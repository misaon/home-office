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
