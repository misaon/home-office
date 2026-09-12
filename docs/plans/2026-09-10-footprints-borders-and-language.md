# Plan — new footprints, an outline around furniture, and the office in two languages

Owner task, 2026-09-10. One pull request. The footprints and the outline were instructions, so they
were carried out as given; the language switch needed four decisions and the owner took them before any
code was written.

## What the owner asked for

1. Seven pieces resized: **meeting table 7×3**, **dining table 7×3**, **fridge 3×2**, **hot tub 5×5**,
   **bookcase 8×1**, **toilet 2×2**, **window 4×1**.
2. Rooms have an outline; furniture should get a slight one too, because two desks facing each other
   read as a single shape.
3. A language switcher in Settings — English by default, Czech on request — with **everything**
   translated, the editor included.

## Owner decisions

| Decision      | Chosen                                                | Rejected                                                                                                          |
| ------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| i18n engine   | react-i18next 17.0.13 with i18next 26.4.2             | A hand-written typed dictionary with native `Intl` (what this plan recommended); Lingui at 10.4 kB min+gzip       |
| Persistence   | `localStorage` in the viewer's browser                | The daemon's `config.json` (a viewer's language is not a server setting); a domain event (history would carry it) |
| Scope         | The whole UI, room and furniture names included       | Chrome only, leaving `standing-ashtray` in a Czech palette; also translating what the daemon writes into chat     |
| Czech wording | Czech UI, established developer terms left in English | Fully Czech (`branch` → větev); Czech with the English term in brackets                                           |

The recommendation was the hand-written dictionary — two languages and ~290 strings use a few percent of
a library's surface, and ADR 005 is a record of 41 rejected candidates. The owner chose the library, and
what it bought back is real and worth writing down: typed keys came free (a mistyped key is a compile
error), `<Trans>` keeps the word order of a sentence that contains `<code>` elements, and Czech plural
agreement is i18next's own `_one/_few/_many` resolution through `Intl.PluralRules`. What it cost is
measured: **+93 KiB** on the UI bundle, 1018 → 1111 KiB.

## The footprints

`OBJECT_SPEC` in `packages/protocol/src/office-layout.ts` is the only place these numbers live, and
`docs/ARCHITECTURE.md` quoted a stale copy of them (a boss's desk 8×4, a reception counter 10×3, a
meeting table 12×5 — none of which the table said). That sentence now matches the code and points at it.

## Why furniture merged, and what fixes it

Objects were already stroked, at `width: 1` in **world** units. A world-unit hairline scales with the
camera, so at the zoom the whole floor is seen at — 24.7 px per cell on a maximised window — it falls
under a pixel and disappears; two pieces sharing a cell edge then read as one shape. Rooms never had the
problem because their edges are `CELL_PX * 0.09`, a proportion of a cell.

Furniture now uses the same idea plus a gap: inset `CELL_PX * 0.08` on every side, outlined at
`CELL_PX * 0.09`. The inset is what separates neighbours — a shared edge drawn twice is still one line —
and the editor gets it for free, because it draws the office through the same `floorTiles`.

## How the language works

- `packages/ui/src/i18n/` holds `en.ts`, `cs.ts` and, because the catalogue is the bulk of both,
  `en-kinds.ts` / `cs-kinds.ts` for room, furniture, door and wall names. `cs.ts` is annotated
  `typeof en`, so a missing or renamed key fails the build rather than showing a blank label.
- `index.ts` initialises i18next before the first render (the dictionaries are in the bundle, so it
  settles in a microtask) and remembers the choice under `ho.language`, next to the setup checklist's
  own `localStorage` key. English is the default and the fallback.
- Pure helpers that produce text — the setup checklist's statuses, the chat's author names, the repo
  field's hints — take a `TFunction` rather than building sentences from fragments. Splitting a sentence
  across keys is what breaks in a language with different word order.
- The Pixi scene is not React, so the editor's map labels take a namer: `kindNameOf(language)` returns
  the lookup, `EditorCanvas` hands it to the scene and re-hands it when the language changes.
- The editor's palette shows names and still searches the slugs, because a slug is what a saved office
  file contains and the owner has files that use them.
- Everything an agent reads stays English: briefs, prompts, MCP tools, the CLI and the daemon's log.
  The switch is the office's own text, and Settings says so.

One thing the Czech default surfaced: `slugify("Nová kancelář")` produced `nov-kancel`, because
stripping everything outside `[a-z0-9]` takes the accented letters along with the accents. It now
decomposes (`NFD`) and drops the diacritics, so the file is `nova-kancelar.json`.

## Verification

Measured in a real browser on 2026-09-10 against a development bundle; the transcript is in
[audit/VERIFICATION.md](../../audit/VERIFICATION.md).

1. `bun run check` green, including the production UI build.
2. The palette shows the new footprints — meeting table and dining table at 7×3 — and names them.
3. Two desks placed side by side read as two rectangles with a visible seam.
4. Settings offers **English | Čeština**; picking Czech turns the header, the tabs, the panels, the
   tooltips and the editor Czech in place, without a reload.
5. The editor in Czech: `Editor kanceláře`, `Zeď | Místnost | Dveře | Nábytek`, `Cihla | Sklo`,
   `Stůl vývojáře 6×3`, `Jednací stůl 7×3`, `Jídelní stůl 7×3`.
6. `layouts/nova-kancelar.json` for an office called `Nová kancelář`.

Not covered: the four provider images were not rebuilt (nothing in them changed), and the desktop
Electrobun shell was not repackaged.
