# ADR 002 — C2: Is PixiJS the best choice now that the game mechanics are more complex?

**Status:** decided — keep PixiJS 8. **Confidence:** high.
**Date:** 2026-09-08. Every version, publish date and download figure below was read from the npm registry
in this session; repository health came from the GitHub API.

## The problem

The office started as a renderer for a static plan and now carries: A* pathfinding with turn and clearance
costs, per-actor step lists, collision reservations, needs-driven idle behaviour, an elevator state
machine, proximity-driven door and furniture animation, a courier/mail choreography, and a back-pressure
gate that makes the daemon wait for an animation to finish. That is a simulation, so the question is fair.

The answer turns on one distinction: **PixiJS is a renderer, not an engine.** Everything listed above lives
in `packages/sim` (2 279 lines, zero dependencies except `tinyqueue`, no DOM, no Pixi) and is drawn by
`packages/ui/src/office` (11 files, ~1 800 lines). The simulation would survive a renderer swap; the
renderer would survive a simulation rewrite. Whatever we pick, we are picking a _renderer_.

## Options

### 1. Keep PixiJS 8 — **recommended**

**Ecosystem state:** `pixi.js@8.20.1`, published **2026-09-08** (the day of this audit), 920 303 weekly
downloads, MIT, 10 dependencies. `pixijs/pixijs` is not archived, last pushed **2026-09-08**, 48 138 stars,
343 open issues. **There is no PixiJS 9** — `latest` is 8.20.1, so the project is on the current major.

**Gain:** nothing to do, and the renderer layer uses precisely what Pixi is good at: `TilingSprite` with a
`Graphics` mask for run-length floor painting, `cacheAsTexture(true)` to bake the static architecture into
one texture, `sortableChildren` with per-object `zIndex` to y-sort actors against furniture, `Texture`
sub-framing to compose wall junctions from two cap tiles (`packages/ui/src/office/walls.ts:116-178`), and
`resolution: window.devicePixelRatio` with `autoDensity` so pixel art is sampled once on Retina.
**Lose:** nothing. **Migration:** none. **Code deleted:** none.
**Perf/RAM:** the current cost is not in Pixi — it is our per-frame allocations at
`packages/sim/src/steps.ts:53` and `packages/ui/src/office/plan-view.ts:133` (findings B18.1, B11.3), which
would exist under any renderer.

### 2. Phaser 4 — reject

**State:** `phaser@4.2.1`, published 2026-07-09, 293 758 weekly, MIT, 1 dependency. Healthy; no criticism
of the project itself.

**Gain:** a game loop, scenes, input, audio, tilemaps, tweens, physics and asset loading in one dependency
instead of a renderer plus our own loop.
**Lose:** the parts that make Phaser Phaser are the parts we already have and do not want twice. Phaser
owns the loop and the scene lifecycle; the office's loop is the Pixi ticker inside a React component and
its state comes from a bridge folding the daemon's event stream (`packages/ui/src/office/bridge.ts`), so a
Phaser `Scene` would either fight React for ownership or shrink to a canvas Pixi already provides. Its
physics is unused — the office is grid-locked with reservation-based collision. Its tilemap loader expects
Tiled files; this layout is generated code (`packages/sim/src/office-plan.ts` builds it from measured
rectangles). Its audio is unused — there is no sound.
**Migration:** rewrite all 11 files of `packages/ui/src/office` (~1 800 lines, ~9 % of the codebase) and
rework the React integration. Irreversible in practice once the renderer layer is Phaser-shaped — this is
the option that would need the owner's approval under §5, and the recommendation is not to ask for it.
**Code deleted:** the camera `#fit` (15 lines) and perhaps the door `Graphics` fallbacks; everything else
would be re-expressed, not removed.
**Perf/RAM:** comparable bundle, but it initialises input, audio, physics registries and a scene manager
the office never uses.

### 3. Excalibur, Kaplay, melonJS — reject on adoption

| Candidate   | Version   | Last publish | Weekly | Verdict                                                                                     |
| ----------- | --------- | ------------ | ------ | ------------------------------------------------------------------------------------------- |
| `excalibur` | 0.32.0    | 2026-09-07   | 8 665  | actively maintained, but 8.7 k weekly is far too thin for the product's only visual surface |
| `kaplay`    | 3001.0.19 | 2026-05-12   | 6 709  | 4 months quiet, 6.7 k weekly                                                                |
| `melonjs`   | 20.3.0    | 2026-08-31   | 758    | 758 weekly downloads                                                                        |

All three are real projects; none has the adoption to justify betting on it against a 920 k-weekly
incumbent released the same day.

### 4. Add an ECS to the simulation — reject at this scale, revisit later

This is the other reading of C2: not "swap the renderer" but "should the simulation be an
entity-component-system?"

| Candidate  | Version | Last publish | Weekly | Licence                                       |
| ---------- | ------- | ------------ | ------ | --------------------------------------------- |
| `koota`    | 0.6.6   | 2026-09-08   | 12 834 | ISC, 0 deps                                   |
| `bitecs`   | 0.4.0   | 2025-12-06   | 11 213 | MPL-2.0, 0 deps                               |
| `miniplex` | 2.0.0   | 2023-07-16   | 7 055  | rejected outright — 3 years without a release |

**Gain:** an ECS separates data from behaviour and gives cheap, cache-friendly queries like "every actor
with a walk step" — exactly the per-tick query behind B18.1.
**Lose:** an ECS pays off in the thousands of entities. This office runs a boss, a receptionist, an
occasional postman and the floor's staff. Measured this session: 2 actors on a fresh floor; the plan
provides 6 developer desks plus 2 QA and 2 analyst seats, so ~11 actors is the designed ceiling per floor.
At that scale the indirection costs more than it saves, and it would replace a directly readable `Actor`
object (`packages/sim/src/world.ts:65-88`) — whose fields a reader takes in at a glance — with component
registries.
**Migration:** most of `packages/sim` (2 279 lines) plus the renderer's actor loop.
**Code deleted:** little; behaviours become systems.
**Perf/RAM:** at 11 actors, neutral to worse. The actual fix for B18.1 is one occupancy index built per
tick — about 15 lines — not an ECS.
**Revisit when:** the office renders several floors at once with dozens of actors each. `koota` is then the
candidate (0 dependencies, ISC, published the day of this audit).

### 5. Pixi plus companion libraries — reject individually

| Candidate       | Version | Last publish | Weekly | Verdict                                                                                                                            |
| --------------- | ------- | ------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pixi-viewport` | 6.0.3   | 2024-11-27   | 90 385 | 22 months quiet, and it would replace `scene.ts#fit` — 15 lines that do exactly what the design wants (full width, never cropped)  |
| `@pixi/tilemap` | 5.0.2   | 2025-07-14   | 2 920  | 2.9 k weekly, and the floor painting it would replace is deliberately run-length batched and baked with `cacheAsTexture`           |
| `@pixi/react`   | 8.0.5   | 2025-12-01   | 80 527 | 9 months quiet, and the imperative `OfficeScene` is the right shape — the scene is driven by a simulation tick, not by React state |
| `@pixi/ui`      | 2.3.2   | 2025-12-02   | 15 525 | the chrome is React + Tailwind; nothing in the canvas needs widgets                                                                |
| `@pixi/sound`   | 6.0.1   | 2024-07-27   | 20 092 | no audio in the product                                                                                                            |
| `pixi-actions`  | 1.2.4   | 2024-09-17   | 108    | 108 weekly downloads                                                                                                               |

## Recommendation

**Keep PixiJS 8.** The complexity C2 worries about lives in `packages/sim`, which is renderer-agnostic by
construction and would not be simplified by any alternative. PixiJS leads the survey by an order of
magnitude in adoption, is on its current major, and the renderer uses its genuinely differentiating
features.

The performance concern behind C2 is real, but it is **ours to fix**: build the occupancy index once per
tick (B18.1), stop allocating a filtered actor array per frame (B11.3), and stop re-hashing actor ids in
the hot loop (B18.2). Those three changes are roughly 40 lines and will do more for frame time than any
engine swap.
