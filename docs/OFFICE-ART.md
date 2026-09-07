# Office art: approved base, integration and deliveries

## Approved reference

The owner approved [office-base-v1.png](../assets/reference/office-base-v1.png) on 2026-09-06 as the visual base
for Home Office (1660 × 948, SHA-256 `8de3369eaa95e775fe0ff6a6b084f3255bd2c5b76fad641625467502a1b02204`). It fixes
the direction — overhead cutaway, warm orange floors and lighting, teal furniture, dark wall caps, readable
characters, dense but orderly decoration — and the room arrangement. It is an illustration, not a tile map:
production geometry lives in code and every destination must be reachable.

| Space                 | Content                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Lobby / reception     | Wall-integrated elevator (arrival point), reception desk with company name, mail counter              |
| Boss office           | One workstation, visitor sofa, plants, window, noticeboard                                            |
| Developer open office | Six workstations, automatic sliding entrance, storage                                                 |
| QA office             | Two opposing workstations                                                                             |
| Analyst office        | Two opposing workstations                                                                             |
| Meeting room          | Corridor entrance, meeting table, wall screen                                                         |
| Kitchen / dining      | Kitchen units, dining table, full-height glass wall facing the terrace; no door into the meeting room |
| Toilets               | Two stalls, sinks, hand dryer and bin                                                                 |
| Lounge                | Sofa, TV and PS5, foosball, dartboard; entrance from the call-booth corridor                          |
| Terrace               | Grill, dining, seating, hot tub with clear passage around it, ashtray                                 |
| Corridors             | Two call booths along the side; clear routes to every door and the elevator                           |

## How the office is built (D19)

- **One floor.** The whole company works in this office; projects are columns on the Board, not floors. The
  plan is pure data in `packages/sim/src/office-plan.ts`: 80 × 46 cells of 24 px (1920 × 1104, D20), rooms, walls,
  doors, glass, 41 objects and 39 anchors. `auditOffice` checks reachability from the elevator on start and the
  UI shows a red banner if a layout change breaks a route.
- **Seats by role.** The boss has the boss office; workers take `dev` desks, reviewers `qa`, clerks `analyst`;
  a full zone overflows into any free desk (`assignWork` in `packages/sim/src/intents.ts`).
- **Arrivals.** Everybody comes by elevator, one car at a time. The passenger is placed inside the car behind
  the closed doors; the doors open (700 ms) and reveal them through the widening gap, they pause 300 ms and walk
  out to their desk or a corridor spot; the doors stay open while anybody is in the car or on its threshold,
  close, wait 600 ms, and the next car brings the next person. The same doors open for a visitor walking back
  into the car. The cabin is a floor-layer sprite under the actors, the doors follow the simulation's door
  amount (`playback: "sim"`), the front frame sits on top. The shaft is a solid wall block (x 0–10, rows 21–28:
  cap on row 21, face to the floor line at row 29, outlined where it borders the lobby floor); the art has no wall
  of its own, so the block's face shows around the frame, the display sits just under the cap and the reception
  backdrop (x 11–24, row 20) starts east of the shaft one row higher, as in the reference. The postman arrives the same way, drops the mail beside the reception counter (`mailbox`, state
  `empty`/`full`) and a courier carries it to the boss.
- **Routing.** A* with cached clearance and turn costs prefers corridor centres and straight runs (walls and
  furniture cost 4 per step alongside, 1.5 two cells away, 1 further; a turn costs 6). Occupied destinations stay
  reachable so meeting points work. Walkers never share a cell: a walker claims the cell it is stepping into, a
  walker whose next cell is taken waits half a second and then plans a detour around the blocker.
- **Doors** open for whoever is about to pass through them — somebody standing in the doorway or with a door
  cell among the next four cells of their path — not for people walking past.
- **Rendering.** `packages/ui/src/office/plan-view.ts` draws the architecture once (cached), glass panels and
  doors that slide open when somebody is within three cells, and one node per object: the delivered sprite when
  `furniture/<key>` is in the manifest, otherwise a geometric stand-in from `stand-ins.ts` in the approved palette.
  Art is drawn at its own pixel size (`CELL_PX` per cell, D20); a sprite delivered at the wrong width is scaled to
  its footprint and reported in the red banner. Room labels are part of the stand-in stage and go away with real
  art.
- **Walls.** Every wall cell is classified (`cap-h`, `face`, `block`, `cap-v`) and drawn from the delivered
  seamless tiles `tiles/wall-*` (`assets/README.md`, “Walls”; all four are in), with flat palette shapes as the
  fallback for a missing class. Straight pieces are tiled runs; every joint (corner, T, cross, end at a door or
  glass) is composed per cell from the two cap tiles — connected sides lose their outline, open sides get an end
  cap — so the caps read as one surface, as in the reference (`packages/ui/src/office/walls.ts`).
- **Camera.** The floor always spans the pane's full width, uniformly scaled and never cropped; when it is taller
  than the pane, the pane scrolls. The canvas renders at the device's pixel ratio, so Retina displays sample the
  art once instead of upscaling a blurry canvas. A collapsible side panel is on the tuning list.
- **Live view.** `bun run ui:watch` rebuilds on every change and the page reloads itself (development builds
  only); `ho daemon --ui` serves it.

## Sprite deliveries

Generated images never land in `assets/src` by hand: `bun run assets:import <png> furniture/<key>/static`
trims the transparent margins, scales the art to the footprint at `CELL_PX` and writes the contract file
(`assets/README.md` has the full contract and the prompt rules). The renderer switches an object from stand-in to
art the moment its key exists; `bun run assets:manifest` lists what is still missing with the size it needs.
Every footprint below was measured on the reference (80 × 46 cells of 20.75 px) and snapped to whole cells;
the footprint is the floor contact, art rises above it. Keys are the delivery file names, one design per room;
`-rotated` desks seat their user north of the desk (front panel and monitors' backs visible). Chairs and wall
decor are walk-through. The table is generated from `officePlan()`; regenerate it after a plan change.

| Key                      | Footprint (cells) | Count | Where                                                                                        | Notes                                                                                       |
| ------------------------ | ----------------- | ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `aquarium`               | 3 × 2             | 1     | dev                                                                                          | walk-through                                                                                |
| `ashtray`                | 1 × 1             | 1     | spa                                                                                          |                                                                                             |
| `bin`                    | 1 × 1             | 1     | corridor                                                                                     |                                                                                             |
| `bookshelf`              | 4 × 3             | 2     | dev                                                                                          |                                                                                             |
| `boss-visitors`          | 7 × 3             | 1     | boss                                                                                         |                                                                                             |
| `bushes`                 | 4 × 2             | 1     | terrace                                                                                      |                                                                                             |
| `call-desk`              | 2 × 1             | 2     | call-1, call-2                                                                               |                                                                                             |
| `chair-analyst`          | 1 × 1             | 1     | analyst                                                                                      | art 1.5 cells wide, centred; walk-through                                                   |
| `chair-analyst-rotated`  | 1 × 1             | 1     | analyst                                                                                      | art 1.5 cells wide, centred; walk-through                                                   |
| `chair-boss`             | 1 × 1             | 1     | boss                                                                                         | art 1.5 cells wide, centred; walk-through                                                   |
| `chair-developer`        | 1 × 1             | 6     | dev                                                                                          | art 1.5 cells wide, centred; walk-through                                                   |
| `chair-qa`               | 1 × 1             | 1     | qa                                                                                           | art 1.5 cells wide, centred; walk-through                                                   |
| `chair-qa-rotated`       | 1 × 1             | 1     | qa                                                                                           | art 1.5 cells wide, centred; walk-through                                                   |
| `copier`                 | 3 × 3             | 1     | dev                                                                                          |                                                                                             |
| `dartboard`              | 2 × 2             | 1     | lounge                                                                                       | walk-through                                                                                |
| `desk-analyst`           | 5 × 3             | 1     | analyst                                                                                      |                                                                                             |
| `desk-analyst-rotated`   | 5 × 3             | 1     | analyst                                                                                      |                                                                                             |
| `desk-boss-rotated`      | 6 × 3             | 1     | boss                                                                                         |                                                                                             |
| `desk-developer`         | 5 × 3             | 6     | dev                                                                                          |                                                                                             |
| `desk-qa`                | 5 × 3             | 1     | qa                                                                                           |                                                                                             |
| `desk-qa-rotated`        | 5 × 3             | 1     | qa                                                                                           |                                                                                             |
| `desk-reception-rotated` | 8 × 4             | 1     | reception                                                                                    |                                                                                             |
| `dining-chair`           | 2 × 1             | 6     | kitchen                                                                                      | walk-through                                                                                |
| `dining-table`           | 8 × 2             | 1     | kitchen                                                                                      |                                                                                             |
| `dryer-bin`              | 1 × 3             | 1     | toilets                                                                                      |                                                                                             |
| `elevator-cabin`         | 7 × 6             | 1     | corridor                                                                                     | walk-through; floor layer; art 6.25 cells wide, centred, feet 0.2 cells onto the floor      |
| `elevator-doors`         | 7 × 6             | 1     | corridor                                                                                     | walk-through; animation `open`; art 6.25 cells wide, centred, feet 0.2 cells onto the floor |
| `elevator-frame`         | 7 × 6             | 1     | corridor                                                                                     | walk-through; art 6.25 cells wide, centred, feet 0.2 cells onto the floor                   |
| `floor-lamp`             | 1 × 1             | 1     | boss                                                                                         | art 2 cells wide, centred                                                                   |
| `foosball`               | 4 × 6             | 1     | lounge                                                                                       |                                                                                             |
| `fridge`                 | 3 × 3             | 1     | kitchen                                                                                      |                                                                                             |
| `grill`                  | 4 × 4             | 1     | terrace                                                                                      |                                                                                             |
| `grill-table`            | 2 × 3             | 1     | terrace                                                                                      |                                                                                             |
| `hedge`                  | 2 × 11            | 1     | terrace                                                                                      |                                                                                             |
| `kitchen-units`          | 8 × 3             | 1     | kitchen                                                                                      |                                                                                             |
| `lounge-console`         | 2 × 2             | 1     | lounge                                                                                       |                                                                                             |
| `lounge-sofa`            | 3 × 9             | 1     | lounge                                                                                       |                                                                                             |
| `lounge-sofa-end`        | 3 × 3             | 1     | lounge                                                                                       |                                                                                             |
| `lounge-table`           | 2 × 3             | 1     | lounge                                                                                       |                                                                                             |
| `mailbox`                | 1 × 1             | 1     | reception                                                                                    |                                                                                             |
| `meeting-chair`          | 2 × 1             | 6     | meeting                                                                                      | walk-through                                                                                |
| `meeting-table`          | 8 × 3             | 1     | meeting                                                                                      |                                                                                             |
| `outdoor-table`          | 7 × 4             | 1     | terrace                                                                                      |                                                                                             |
| `picture`                | 4 × 2             | 1     | boss                                                                                         | walk-through                                                                                |
| `picture`                | 3 × 2             | 3     | dev, qa, analyst                                                                             | walk-through                                                                                |
| `picture`                | 2 × 2             | 3     | reception, lounge                                                                            | walk-through                                                                                |
| `picture-small`          | 2 × 1             | 3     | dev                                                                                          | walk-through                                                                                |
| `picture-tall`           | 1 × 4             | 1     | dev                                                                                          | walk-through                                                                                |
| `potted-plant-1` … `-5`  | 1 × 1             | 17    | boss, dev, qa, analyst, corridor, reception, meeting, kitchen, toilets, lounge, terrace, spa | five delivered designs in turn; art 2 cells wide, centred; toilets 2 × 1                    |
| `plant-table`            | 2 × 2             | 1     | dev                                                                                          |                                                                                             |
| `planter-tall`           | 2 × 1             | 1     | dev                                                                                          |                                                                                             |
| `projector`              | 2 × 2             | 1     | meeting                                                                                      |                                                                                             |
| `radiator`               | 1 × 4             | 1     | analyst                                                                                      | walk-through                                                                                |
| `rug-beige`              | 8 × 8             | 1     | lounge                                                                                       | walk-through; floor layer                                                                   |
| `rug-green`              | 10 × 7            | 1     | kitchen                                                                                      | walk-through; floor layer                                                                   |
| `rug-teal`               | 8 × 8             | 3     | boss, qa, analyst                                                                            | walk-through; floor layer                                                                   |
| `rug-teal`               | 17 × 7            | 2     | dev                                                                                          | walk-through; floor layer                                                                   |
| `rug-teal`               | 12 × 8            | 1     | meeting                                                                                      | walk-through; floor layer                                                                   |
| `sinks`                  | 2 × 4             | 1     | toilets                                                                                      |                                                                                             |
| `spa`                    | 5 × 6             | 1     | spa                                                                                          | animation `bubbles`                                                                         |
| `spa-bench`              | 2 × 2             | 1     | spa                                                                                          |                                                                                             |
| `string-lights`          | 20 × 1            | 1     | terrace                                                                                      | walk-through                                                                                |
| `terrace-chair`          | 2 × 1             | 4     | terrace                                                                                      | walk-through                                                                                |
| `terrace-chair`          | 2 × 2             | 2     | terrace                                                                                      | walk-through                                                                                |
| `terrace-round-table`    | 3 × 4             | 1     | terrace                                                                                      |                                                                                             |
| `terrace-sofa`           | 3 × 6             | 1     | terrace                                                                                      | art 4 cells wide, centred                                                                   |
| `toilet`                 | 2 × 3             | 2     | toilets                                                                                      |                                                                                             |
| `tv`                     | 1 × 6             | 1     | lounge                                                                                       | art 1.5 cells wide, centred                                                                 |
| `wall-screen`            | 5 × 2             | 1     | meeting                                                                                      | walk-through                                                                                |
| `wall-shelf`             | 7 × 2             | 1     | reception                                                                                    | walk-through                                                                                |
| `window`                 | 1 × 4             | 1     | boss                                                                                         | walk-through                                                                                |
| `window`                 | 4 × 2             | 3     | dev                                                                                          | walk-through                                                                                |
| `window`                 | 4 × 1             | 2     | toilets, lounge                                                                              | walk-through                                                                                |

Characters: sets `boss`, `agent-a`, `agent-b`, `agent-c` and `postman` are the placeholders in use today (32 × 32
frames from the 16 px era; the renderer scales any set to two cells tall). A delivered set replaces one by name: frames 2 cells wide × 5 tall (D21),
`bun run assets:import <strip.png> characters/<set>/<activity>_<dir> --frames N`. The activities and facings the
simulation asks for are tabulated in `assets/README.md`; `idle_s` alone already renders, the rest falls back to it.

## Later

Glass and door tiles (walls and floors already take delivered seamless tiles; the flat palette colour remains for
rooms without a floor tile), an elevator travel indicator, monitor and TV states, hot-tub water, a collapsible side
panel, texture atlas packing once the scene is complete.
