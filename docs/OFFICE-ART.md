# Office art: approved base and production plan

## Approved reference

The owner approved [office-base-v1.png](../assets/reference/office-base-v1.png) on 2026-09-06 as the visual base for Home Office. Preserve this file unchanged; future concept revisions receive a new version.

- Source: `exec-35fc832e-b859-402c-a10d-ae73246e3d18.png`, the final iteration after the kitchen glass wall and six detail adjustments.
- Dimensions: 1660 × 948 pixels, RGB PNG.
- SHA-256: `8de3369eaa95e775fe0ff6a6b084f3255bd2c5b76fad641625467502a1b02204`.
- Approved direction: overhead cutaway office, warm orange floors and lighting, teal furniture, dark wall caps, readable characters, dense but orderly decoration, a rectangular composition filling the office view.
- This approves the visual direction and room arrangement. The flattened illustration is not an executable tile map, collision map, or production spritesheet. Production geometry must make every destination reachable. Correct small mechanical inconsistencies during sprite construction, including exactly four controlled foosball rods per player, eight rods in total.

### Room and content requirements

| Space                 | Required content                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lobby / reception     | Wall-integrated elevator as the main arrival point; animated travel indicator; reception desk with monitor, phone, and runtime company name on its front fascia; files and wall decoration |
| Boss office           | One workstation, visitor chairs, plants, window, noticeboard                                                                                                                               |
| Developer open office | Six workstations, automatic sliding entrance, wall AC, storage and decoration                                                                                                              |
| QA office             | Two opposing workstations; monitors oriented toward their respective users                                                                                                                 |
| Analyst office        | Two opposing workstations; monitors oriented toward their respective users; wall AC                                                                                                        |
| Meeting room          | Corridor entrance, meeting table, ceiling projector facing the wall screen                                                                                                                 |
| Kitchen / dining      | Kitchen units, dining table, full-height glass wall facing south onto the terrace; no doorway directly into the meeting room                                                               |
| Toilets               | Two stalls, accessible sinks and entrance, hand dryer and bin against the wall, privacy window                                                                                             |
| Lounge                | Sofa, TV and PS5 against the left wall, foosball, wall dartboard; entrance from the call-booth corridor                                                                                    |
| Terrace               | Grill, dining, seating, hot tub with clear passage around it, plants and ashtray                                                                                                           |
| Corridors             | Two call booths along the side, separated from the meeting room by a wall; clear routes to all doors and the elevator                                                                      |

## Working layout lab (2026-09-06)

Run `bun run office:lab` and open <http://127.0.0.1:47810/office-lab>. The loopback-only server builds the UI and manifest, watches UI/simulation sources and native sprites, and reloads the browser after a successful rebuild. Keep that process running while reviewing. No daemon, credentials or model sessions are started. The regular app also links to `/office-lab`; automatic rebuild/reload and the reference-image link are provided by the standalone server.

The first implementation is a **technical layout prototype**, using simple geometric furniture and the existing placeholder character frames. It does not replace the approved artwork or the live project's floor templates. The polished art-density sample remains the next production milestone.

- Pure data: `packages/sim/src/office-plan.ts`, 80×46 logical cells, 16 px per cell (1280×736 native), 6 developer + 2 QA + 2 analyst desks and 1 boss desk.
- Geometry follows the approved room arrangement. Main corridor: 4 cells deep; call-booth approach: 4 cells wide; the hot tub has 2 cells clear on both sides. Door thresholds are at least 2 cells wide.
- The same `gridFor`, A* and simulation step executor used by the application drive the preview actor. `office-audit.ts` exposes read-only reachability diagnostics in the UI. The lab deliberately chooses a named seat; production role-based assignment and overflow are still pending.
- OfficeScene accepts a floor-view factory so the lab can supply architectural stand-ins while reusing character frame animation, floor transfer and Y sorting. Overview uses proportional fit; close-ups use integer pixel zoom. Normal office views retain pixel zoom and now shrink by reciprocal integer factors when the whole floor exceeds the viewport.
- Door leaves react to actor proximity; the elevator indicator and leaves react to the existing hidden transfer step. Door animation is a visual prototype over permanently walkable thresholds; hinges, locking and final sprites are not implemented.
- Controls: full map, workstation/elevator close-ups, grid, replay arrival, tour all destinations, pause, destination selection, and click-to-walk. Yellow lines show the planned route. `window.__officeLab` exposes the local sample for debugging only.

Validation: all **30 anchors** reachable; **2,729 walkable cells**, none disconnected; all door thresholds reachable. A one-off headless simulation exercised elevator arrival and sequential visits to all 30 anchors without a blocked tile or missed destination. Browser inspection confirmed the working/typing state, grid and close-up controls, proportional full-map fit, and no console warnings/errors during the inspected run. `bun run check` passed. No automated test suite was added (Phase 8 decision).

## Existing implementation, verified 2026-09-06

| Area                | Current contract                                                                                                        | Consequence for the new art                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine              | PixiJS 8.20.1 in `package.json`; WebGL, nearest texture sampling, rounded pixels, 30 fps ticker                         | The existing engine can render the intended scene; no engine replacement is needed                                                                                         |
| Asset files         | `assets/src/<category>/<sprite>/<animation>[_<dir>]_f<n>.png`                                                           | Deliver reusable transparent PNG frames and preserve stable sprite identifiers                                                                                             |
| Import sizes        | Tiles, props and bubbles: 16×16; characters: 32×32; furniture: multiples of 16, at most 64×64 per frame                 | These are project importer limits, not PixiJS limits; modular pieces fit today, larger pieces require an explicit importer change                                          |
| Generator inputs    | Native frames or `@8x` frames/strips in `assets/inbox`; importer samples the centre of each 8×8 block and slices strips | Enlarged generated art needs an actual consistent pixel grid; arbitrary downsampling of the concept cannot recover clean native art                                        |
| Manifest            | Version 1, tile size 16, individual frame paths; generated by `bun run assets:manifest`                                 | There is no packed texture atlas yet; keep this path for the first playable sample                                                                                         |
| Character animation | North, south, east; west mirrors east; activity clips selected and advanced in the renderer                             | Start with idle, walk and typing; use consistent canvases, feet alignment and frame registration                                                                           |
| Furniture           | Static sprite using the first texture of the selected clip                                                              | Doors, elevator, screens and water need persistent animated object views and state updates                                                                                 |
| Layers              | Floor and walls cached together; furniture and actors sorted by bottom Y                                                | Tall walls, glass, door leaves and seated poses need explicit foreground pieces or revised sorting where they overlap characters                                           |
| Placement           | Furniture has `at`, rectangular `w` / `h`, and `blocks`; bottom-left visual anchor                                      | Visual overhang, sorting baseline and collision footprint currently share implicit assumptions; define them separately for richer objects                                  |
| Walkability         | Walls and blocking furniture rectangles; a door is a cleared wall cell                                                  | A drawn doorway alone is insufficient: its entrance, approach space and interaction positions must exist in the map                                                        |
| Floors              | Current templates are 40×22 tiles (640×352 logical pixels); lobby plus one floor per repository-backed project          | Translate the approved composition onto a grid; do not force it into the old dimensions if that compresses corridors                                                       |
| Seats               | Generic desk anchors, plus boss desk; free seats chosen using seeded RNG and reservations                               | QA and analyst zones need explicit seat eligibility and a domain-role mapping, not just different desk art                                                                 |
| Elevator            | Every floor has an elevator anchor; agents hide for 1500 ms during transfer                                             | Preserve the travel contract while synchronizing doors and indicators with arrivals and departures                                                                         |
| View fit            | Integer zoom, minimum 1×, centred; app has a fixed 400 px side panel                                                    | Fullscreen office needs a collapsible/overlay panel and a deliberate fit/camera policy; arbitrary display ratios cannot all be filled without margins, crop, or distortion |

Code entry points:

- [Asset importer](../scripts/assets-import.ts), [manifest builder](../scripts/lib/manifest.ts), [asset contract](../assets/README.md).
- [Texture loading and animation lookup](../packages/ui/src/office/sprites.ts), [scene rendering](../packages/ui/src/office/scene.ts), [canvas lifecycle](../packages/ui/src/office/office-canvas.tsx).
- [Floor templates and collision construction](../packages/sim/src/templates.ts), [seat assignment](../packages/sim/src/intents.ts), [travel steps](../packages/sim/src/steps.ts), [domain-to-simulation bridge](../packages/ui/src/office/bridge.ts).
- [Application shell](../packages/ui/src/app.tsx), [desktop asset packaging](../scripts/desktop-prepare.ts).

The reference lives outside `assets/src`, so it is not scanned into the manifest. Desktop packaging copies `assets/src` and `assets/dist`, leaving the reference out of the runtime bundle.

## Production sequence

### 1. Make the approved layout executable

Create a deterministic grid plan with room bounds, wall segments, door gaps, furniture footprints and interaction anchors. Include 6 developer, 2 QA, 2 analyst and 1 boss workstation. Check paths from the elevator to every seat and shared facility before detailed art production. Account for chair positions and door approaches, not only corridor centre lines.

Keep the existing multi-floor/project routing while building the new template. The approved image does not itself change project routing or domain roles. Specify how QA/analyst seats map to current agent roles and how occupancy beyond the illustrated capacity is handled before wiring the new template into `bridge.ts`.

Use the existing 16 px logical grid for the initial layout prototype. Final map dimensions and visual pixel density remain implementation choices to settle with the sample below; the concept's 1660×948 export size is not a required native canvas size.

### 2. Calibrate one playable sample

Build a small scene containing a corridor, a wall-integrated elevator, one sliding door, one desk and chair, a glass segment, and one moving/typing character. Match the approved palette, perspective and proportions. Preview at actual application sizes, including integer zoom, before producing the full library.

Start with the current 16 px tiles and 32 px character canvas. If these cannot retain the approved detail, compare a denser art sample and update the importer, manifest and renderer scale contract together. Decide this once before mass production. Do not mix pixel densities across asset batches.

The sample must demonstrate arrival, door passage, walking behind and in front of objects, and correct seated overlap. Use the existing frame loader first; texture packing is independent of visual approval.

### 3. Produce reusable assets in batches

The approved PNG contains people, shadows, opaque backgrounds and partially hidden furniture. Use it as the style/placement reference, reconstructing isolated complete objects on transparent backgrounds. Cropping it into rectangles would retain those overlaps and leave missing pixels behind moving characters.

| Batch           | Deliverables                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture    | Seamless floor tiles; wall faces, caps, corners and junctions; windows; glass panels; door jambs and leaves; terrace decking and rails               |
| Workplaces      | Desk orientations, chairs, monitors, reception counter, meeting table, storage, shelving; separate foreground parts where seated actors require them |
| Shared spaces   | Kitchen modules, appliances, bathroom fixtures, sofa, TV/console, foosball, dartboard, grill, hot tub and outdoor furniture                          |
| Decoration      | Plants, pictures, noticeboards, AC, small desk items, lighting and signs                                                                             |
| Characters      | Consistent front/back/side idle and walk cycles, typing/seated poses, then the remaining activities already requested by the simulation              |
| Dynamic objects | Elevator and doors; monitor/TV states; hot tub water; other activity feedback where it adds useful information                                       |

Small static clutter may be baked into a desk variant; items that animate, change state, or need independent overlap should be separate. Draw perspective-specific furniture orientations instead of rotating a finished sprite by 90 degrees. Mirrored characters are acceptable under today's contract; asymmetrical clothing or handed props need dedicated west frames and a loader change if accurate left/right detail matters.

For every object, record native canvas dimensions, pivot/placement offset, sorting baseline, collision footprint, available orientations, interaction anchors and animation states. This is the proposed production metadata; the current manifest does not yet store it. Keep simulation geometry in pure `packages/sim` data and texture/rendering details in `packages/ui`.

### 4. Connect art to behaviour and UI

- Separate static floor caching from foreground occluders as needed. Give glass an explicit rendering order; transparency alone does not solve overlap.
- Extend object rendering to update animation frames and visual states. Tie elevator feedback to the existing transfer lifecycle. Automatic door leaves can be visual while their route remains walkable; if doors become gameplay blockers, update walkability and routing with their state.
- Add role-aware seat selection with reservations and well-defined fallback/overflow behaviour. Preserve the existing handoff steps when changing seating or travel.
- Render the company name, floor indicator and changing status text as runtime overlays on blank sprite surfaces.
- Provide an office view with collapsible/overlay panels. Preserve aspect ratio and crisp pixels; handle smaller windows through an explicit camera/fit policy rather than stretching sprites.
- After the first sample works, consider packing frames into texture atlases and adapting the loader. Preserve frame names, original bounds and pivots when trimming; measure before making atlas packing a release requirement.

### 5. Review in the running application

Manually verify every anchor's reachability from the elevator, occupied desk approaches, room entries, terrace passage, opposite-facing desks, seated poses, glass/door overlap and elevator transfer. Check transparency edges and frame stability at actual zoom levels. Exercise multi-floor travel and task handoffs, then measure the completed scene against the current 30 fps target.

Run the repository checks for implementation changes. Automated test suites remain deferred until Phase 8 under the owner's existing decision; document the manual checks and findings in the plan log.

## PixiJS reference

Official documentation consulted on 2026-09-06:

- [Textures](https://pixijs.com/8.x/guides/components/textures): texture sources, frames, original bounds/trim, sampling options, and loading spritesheets through `Assets`.
- [Containers](https://pixijs.com/8.x/guides/components/scene-objects/container): scene graph, child sorting and caching static content with `cacheAsTexture`.
- [Sprites](https://pixijs.com/8.x/guides/components/scene-objects/sprite): texture-backed objects, anchors and transforms.

These support the rendering approach. Frame dimensions, file naming, seat roles, collision rules and the staged production sequence above are Home Office decisions, not restrictions imposed by PixiJS.
