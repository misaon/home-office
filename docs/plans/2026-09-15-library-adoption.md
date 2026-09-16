# Less of our own code: what a library can take over, measured

The owner's task, 2026-09-15: audit the codebase against September 2026 libraries and adopt anything that
would shrink it or improve it — "we have a lot of our own code to look after".

The survey measured **26 102 lines** of first-party TypeScript across 15 packages (the vendored Hutch
devkit under `apps/desktop/.hutch` is excluded; its largest file alone is 4 034 lines, bigger than any
four of ours). The largest first-party file is 289 lines. There is no hand-rolled framework hiding
anywhere, which is why most of this document is measurements that came back "keep".

The owner's decisions on the findings: **adopt Base UI as the single core for every component that has
one**, plus commander for the CLI, lucide-react for the icons, and simple-git for the host's git.

## The one defect the survey found, measured in a browser

`SelectField` is a `<button>` that toggles a `<div>` of `<button>`s. Driven through CDP against the real
office at two window sizes:

| Probe                                       | 1440×900                    | 1024×640                    |
| ------------------------------------------- | --------------------------- | --------------------------- |
| sheet scrolls                               | no                          | **yes**                     |
| option list clipped by the scroll container | no (−168 px)                | no (−169 px)                |
| `role` on the list / `role` on an option    | `null`                      | `null`                      |
| any `aria-expanded` in the dialog           | **no**                      | **no**                      |
| **Escape with the select open**             | **closes the whole dialog** | **closes the whole dialog** |

The clipping I expected to find is **not** there — the list has 168 px of headroom even when the sheet
scrolls, so that hypothesis is withdrawn. What is real: no listbox semantics, no arrow keys, and Escape
over an open dropdown throws away the half-filled "New agent" form. That is the defect the adoption
fixes, and it is why this is a correctness change before it is a size change.

## What Base UI costs, measured

`@base-ui/react` **1.8.0** (MUI, published 2026-09-04, 9.7 M weekly, repo pushed 2026-09-15, 5
dependencies: `@babel/runtime`, `@base-ui/utils`, `@floating-ui/react-dom`, `@floating-ui/utils`,
`use-sync-external-store`). Peer range `react ^17 || ^18 || ^19`, so React 19.3 is in range.

Note for anyone reading the old name: **`@base-ui-components/react` is deprecated on npm**; the package
is `@base-ui/react`.

Bundled with `bun build --minify --target=browser`, React subtracted:

| Import                                     |                    Bytes minified |
| ------------------------------------------ | --------------------------------: |
| the twelve namespaces this migration needs |                       **265 781** |
| dialog alone                               |                            87 866 |
| select alone                               |                           148 098 |
| menu alone                                 |                           174 698 |
| switch / radio-group / toggle-group        |          22 957 / 28 180 / 24 382 |
| collapsible / field / tabs / toast         | 37 210 / 43 141 / 53 703 / 96 231 |

The per-component figures overlap heavily through shared internals — twelve namespaces together cost
265 781 bytes, not the 700 kB the rows add up to. Against today's bundle of 1 298 792 bytes that is
**+20.5 %**. The office is served from local disk by its own daemon, so this is a number to record
rather than a reason to stop, but it is the price and it should be visible.

## The mapping: every component, and what it becomes

| Ours                          | Lines | Base UI            | Verdict                                                                                     |
| ----------------------------- | ----: | ------------------ | ------------------------------------------------------------------------------------------- |
| `dialog-sheet.tsx` (`Modal`)  |   131 | Dialog             | adopt — **and this is the risky one, see below**                                            |
| `confirm.tsx`                 |   134 | AlertDialog        | adopt                                                                                       |
| `lightbox.tsx`                |    64 | Dialog             | adopt                                                                                       |
| `sheet-shell.tsx`             |    57 | Dialog             | adopt                                                                                       |
| `select-field.tsx`            |    92 | Select             | adopt — the defect above                                                                    |
| `chat-usage-menu.tsx`         |   120 | Menu               | adopt                                                                                       |
| `floor-menu.tsx`              |    88 | Menu               | adopt                                                                                       |
| `settings-floor-switches.tsx` |    90 | Switch             | adopt                                                                                       |
| `pick-card.tsx`               |    59 | Radio + RadioGroup | adopt                                                                                       |
| `agent-roles.tsx`             |   111 | Radio + RadioGroup | adopt                                                                                       |
| `segmented.tsx`               |    31 | ToggleGroup        | adopt                                                                                       |
| `filter-chips.tsx`            |    50 | ToggleGroup        | adopt                                                                                       |
| `floor-row.tsx`               |    97 | Collapsible        | adopt                                                                                       |
| `settings-cred-row.tsx`       |    57 | Collapsible        | adopt                                                                                       |
| `setup-token-field.tsx`       |    94 | Field              | adopt                                                                                       |
| `header-tabs.tsx`             |    48 | Tabs               | adopt — **this row said "no" and was wrong**, see the audit below                           |
| `toast.tsx`                   |    15 | Toast              | **no** — 15 lines against a Provider, a Viewport and a Root; Base UI's Toast alone is 96 kB |
| `controls.tsx`                |    55 | —                  | **no** — office chrome, no counterpart                                                      |
| `panel.tsx`, `section.tsx`    |    56 | —                  | **no** — pure layout                                                                        |
| `icons.tsx`                   |    69 | —                  | replaced by lucide-react instead                                                            |

**16 of 20 adopt**, and the inventory itself turned out to be incomplete — see the audit below. The four
that do not are named with the reason rather than quietly skipped: "Base UI everywhere it has a
primitive" is the instruction, and Toast, layout and office chrome are where it does not have one that
fits.

Beyond the files, the migration removes shared state: Base UI owns each popup's open flag and its
outside-click, so the design store's `popover` field, the scrim in `app.tsx:73` and the **eight** places
that clear `popover` by hand all go. That is the same class of win as the second simplification round —
one invariant that cannot be forgotten, because nothing maintains it any more.

## The structural consequence, stated before the work starts

**Base UI's Dialog is not the native `<dialog>` element.** It composes `Root / Trigger / Portal /
Backdrop / Viewport / Popup` out of `div`s and drives state with `data-open`, `data-closed`,
`data-starting-style` and `data-ending-style`. Today's `Modal` calls `showModal()` and paints the scrim
with the `::backdrop` pseudo-element. Three things follow:

1. `BACKDROP` (`backdrop:bg-scrim-a74 backdrop:backdrop-blur-[10px] backdrop:animate-fade-280`) stops
   being a `::backdrop` variant and becomes ordinary classes on `Dialog.Backdrop`. The
   `@source not inline("backdrop-blur-[10px] animate-fade-280")` line in `app.css`, added when Tailwind
   emitted those two utilities bare, has to be revisited — they will be selected for real now.
2. The `animate-fade-280` / `animate-pop-440` / `animate-rise-240` keyframes have to be re-expressed
   against Base UI's data attributes.
3. The focus trap, Escape and inertness stop being the platform's and become the library's. That is the
   point of the change for Select; for Dialog it is a trade, because the platform was already correct.

**Pixels will move**, and the office is verified by image. The same applies to lucide-react: its `Check`
is a different path in a 24×24 box from the office's own `polyline points="1.8,5.2 4,7.4 8.2,2.6"` in
10×10.

**The owner's decision, 2026-09-15: a free hand.** Base UI's behaviour and default look are taken as
given and only colours and spacing are tuned back towards the office. That is a deliberate trade and it
costs the project its acceptance test: the 28-state zero-tolerance comparison that verified the last
three rounds **stops being the measure here**, because the drawing is meant to move. What replaces it
for this task is `bun run check`, behavioural probes against the real office through CDP (the Escape
defect, the listbox roles, keyboard traversal), and screenshots for the owner to look at — evidence of
what changed rather than proof that nothing did.

The second decision: **all eight phases in one pass**, rather than stopping after the Select.

## The other three adoptions

| Adoption                              | Measured                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **commander 15.0.0** for `apps/cli`   | 370.8 M weekly, MIT, **0 dependencies**, repo pushed 2026-09-14. Replaces `args.ts` (88) and the dispatch and generated help in `cli.ts` (111) — ~120 lines. **This reverses ADR 006**, which rejected it because its string-keyed options add a second validation style beside Zod; that trade-off has not changed, the owner's answer has |
| **lucide-react 1.46.0** for the icons | 74.1 M weekly, published 2026-09-14. Three icons tree-shake to **3 507 bytes**; `icons.tsx` is 69 lines. The geometry differs from the office's own marks                                                                                                                                                                                   |
| **simple-git 3.36.0** for host git    | 8.2 M weekly, MIT, 5 dependencies, published 2026-04-12. Covers `repo-inspect.ts` (100 lines of thin `git` wrappers). It does **not** cover `git-bridge.ts` (124), which runs git _inside a container_ through the sandbox provider, nor `mirrors.ts` (102), which serialises work with an in-process lock                                  |

## What the survey measured and kept, with the number that decided it

Recorded so the next sweep does not re-litigate them.

| Ours                                                                                          | Lines | Candidate                                                   | Why it stays                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ----: | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sandbox-docker`                                                                     |   728 | dockerode 5.0.1                                             | dockerode pulls `@grpc/grpc-js`, `protobufjs`, `docker-modem` and `tar-fs`; our client is 229 lines of `fetch({ unix })` and the other 264 are domain (labels, mounts, isolation) that no client provides                                                                                                                    |
| `runner/pump.ts`                                                                              |    28 | `Bun.JSONL`                                                 | it relays arbitrary text, not JSON, and carries a 1 MiB per-line overflow guard; JSONL gives neither                                                                                                                                                                                                                         |
| `cli/commands/secret.ts`                                                                      |    16 | `Bun.Terminal`                                              | measured: `Bun.Terminal` is a pty **spawner** (`write`, `resize`, `close`), not a handle on our own stdin. `process.stdin.setRawMode` does exist in Bun 1.4.2 on a TTY, but raw mode drops canonical mode and SIGINT too, so replacing `stty -echo` with it means writing backspace and Ctrl-C by hand — more code, not less |
| `ui/sync.ts` + `ui/store.ts`                                                                  |   313 | `@tanstack/db` 0.9.2                                        | event-log replay with a log-identity check and replay-from-seq; a different model, and 0.62 M weekly                                                                                                                                                                                                                         |
| `office/bridge.ts`                                                                            |   284 | `@pixi/react` 8.0.5                                         | last published **2025-12-01**, 64 k weekly, and it would put a 30 Hz imperative simulation inside React's render loop                                                                                                                                                                                                        |
| `packages/sim` entities                                                                       |   737 | bitecs / miniplex / koota                                   | 8.1 k / 4.8 k / 11.8 k weekly; miniplex last published 2023-07-16. The package must stay pure and deterministic with an injected RNG                                                                                                                                                                                         |
| CSS keyframes                                                                                 |     — | `motion` 13.3.0                                             | 15.4 M weekly, but the office animates in CSS and in Pixi; this would be bundle for nothing                                                                                                                                                                                                                                  |
| `core/result.ts`, `core/ids.ts`, `core/async-channel.ts`, `sim/grid.ts`, `single-instance.ts` |     — | neverthrow, uuid, it-pushable, pathfinders, proper-lockfile | re-checked; ADR 005's reasoning holds and nothing in the week since has changed it                                                                                                                                                                                                                                           |

## Phases

| Phase | Work                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `@base-ui/react` into the catalog and `docs/STACK.md`; Select first — the defect, and the smallest surface to prove the React Compiler, the data-attribute animations and the pixel match on |
| 2     | The two menus; the design store's `popover` field, the scrim and the eight hand-clears go                                                                                                    |
| 3     | The four dialogs (`Modal`, `Confirm`, `Lightbox`, `SheetShell`), including the `::backdrop` rewrite                                                                                          |
| 4     | Switch, Radio, ToggleGroup, Collapsible, Field — the eight remaining components                                                                                                              |
| 5     | lucide-react for the three marks                                                                                                                                                             |
| 6     | commander for the CLI, and ADR 006 amended to record that it was reversed and why                                                                                                            |
| 7     | simple-git for `repo-inspect.ts`                                                                                                                                                             |
| 8     | Docs: `STACK.md`, `PLAN.md`, ADR 005/006 amendments, this plan's outcome                                                                                                                     |

Each phase ends with `bun run check` and, for phases 1–5, the 28-state office comparison. Phase 1 is
deliberately the smallest one that exercises every risk in the migration, so that a failure there is
cheap.

## What the work came to

| Phase | Work                                                                   | Commit    |
| ----- | ---------------------------------------------------------------------- | --------- |
| 1     | `@base-ui/react` in the catalog; the Select                            | `d832a62` |
| 3     | The dialogs — `Modal`, `Confirm`, the lightbox, the editor overlay     | `5a2596b` |
| 2     | The two menus, and `floorOpen` / `floorX` / `popover`                  | `b5aa01f` |
| 4     | Switch, Radio, ToggleGroup, Accordion, and `credOpen` / `floorRowOpen` | `fd22183` |
| 5     | lucide-react                                                           | `bcb7a5b` |
| 6     | commander, reversing ADR 006                                           | `525ea3e` |
| 7     | simple-git for `repo-inspect.ts`                                       | `ecc0803` |
| —     | The four defects the screenshots found                                 | `a160ed9` |

Phases 2 and 3 swapped places once the Select was measured: while the dialogs were still native
`<dialog>` elements, everything outside them was inert, so the portalled listbox could not take focus
and the arrow keys did nothing. Moving the dialogs first removed that boundary.

**Seven fields of UI state no longer exist**: `popover`, `floorOpen`, `floorX`, `credOpen` and
`floorRowOpen` in the design store, plus the two invisible full-screen scrims in `app.tsx` and the eight
places that cleared `popover` by hand. Base UI owns each popup's open state, so there is no invariant
left to forget.

### What the office looks like now

28 states, each compared against the office as it stood before Base UI:

| Outcome                                     | States |
| ------------------------------------------- | -----: |
| byte-identical                              |      7 |
| 36–124 px (0.003–0.01 %) — the lucide marks |      8 |
| 0.08–1.3 % — the dialogs and their forms    |      5 |
| 3.4 % — `usage-res`, the known flaky state  |      1 |
| 5.6–15.3 % — open menus and the lightbox    |      5 |
| not reachable by the harness any more       |      2 |

The last row is honest rather than hidden: Base UI renders a radio as a `span` with `role="radio"`, and
the harness clicks by finding a `BUTTON` or an `A` whose text matches, so `new-floor-git` and
`agent-select-open` can no longer be driven. The control itself was verified directly instead —
`role="radiogroup"`, two `role="radio"` children, ArrowRight and ArrowLeft moving the selection.

### What the Select actually gained

Measured through CDP against the running office, after the dialogs moved:

| Before                                  | After                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| no `role="listbox"`, no `role="option"` | `role="listbox"`, three `role="option"`, `aria-selected` on the value                        |
| no `aria-expanded`                      | `aria-expanded` false → true → false                                                         |
| arrow keys did nothing                  | neutral → male → female → male, no wrap at the ends                                          |
| **Escape discarded the whole form**     | Escape closes the select and returns focus to the trigger; a second Escape closes the dialog |

### The cost, measured

| Bundle after                 |   KiB |
| ---------------------------- | ----: |
| before Base UI               | 1 859 |
| Select                       | 1 984 |
| dialogs                      | 2 002 |
| menus                        | 2 029 |
| switches, cards, chips, rows | 2 053 |
| lucide                       | 2 055 |
| checkbox and repairs         | 2 060 |

**+201 KiB, +10.8 %** — less than the 265 781 bytes the twelve-namespace probe predicted, because the
office does not use every part of every namespace. `apps/cli` is 157 lines lighter and 124 heavier.

### The instrument, twice

Both times a measurement looked alarming it was the instrument first. The 97 % figure was a stale
launch token. And the earlier claim in this document that the select's list is clipped by its scroll
container was withdrawn before any code was written, because the browser said it has 168 px of headroom.
Check what the port is serving, and check what the query is selecting, before believing either.

## The audit the owner asked for, 2026-09-15

"Check that every component really is wired to Base UI, and to its documentation's best practices." The
check was run against the browser's accessibility tree rather than against the source, because that is
what a screen reader actually gets. It found six things.

### Four controls had no accessible name

Base UI's docs are explicit: Select says _"prefer `<Select.Label>`, or provide an `aria-label`"_; Switch,
Radio and Checkbox each say _"form controls must have an accessible name"_; the ToggleGroup example
carries `aria-label="Text alignment"`; every Popover example renders a `Popover.Title`. Read from
`Accessibility.getFullAXTree`:

| Control                           | Name before | Name after                                  |
| --------------------------------- | ----------- | ------------------------------------------- |
| `ToggleGroup` — board, team chips | «empty»     | "Filter the board by status"                |
| `RadioGroup` — roles, sources     | «empty»     | "who they are" / "where does the code live" |
| `Popover` — floor menu            | «empty»     | "Floors (projects)"                         |
| `Select` listbox                  | «empty»     | the field's own label                       |

The rest were already named, and the tree says so: `combobox` "PROVIDER"/"MODEL"/"EFFORT"/"SIGN-IN"/
"GENDER" from `Select.Label`, `switch` "Open a pull request", `dialog` "New agent"/"New floor",
`checkbox` "Bea worker · sonnet/high".

### Three deviations from the documented anatomy

- The dialogs were labelled by `aria-label` on the popup rather than by `Dialog.Title`, which the docs
  list as part of the anatomy. The agent dialog's visible heading and subtitle are now `Dialog.Title` and
  `Dialog.Description`; `Confirm` already used the AlertDialog equivalents. The dialogs with no visible
  heading (Setup, the lightbox, the editor) keep `aria-label`, the documented fallback.
- The Cancel buttons closed their dialogs through a callback. `Dialog.Close` is how Base UI spells that,
  and the docs ask for _"a clear, targetable control to click to close"_.
- The switches were named with `aria-label`; the docs' first example is _"an enclosing `<label>` is the
  simplest labeling pattern"_, so they have one now, with the hint outside it so the name is the title.

### The inventory had missed six components

| Component                   | Now         | What it was                                                                                                                                                                                                 |
| --------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `header-tabs.tsx`           | Tabs        | the plan claimed Tabs wanted to own the state and render Panels. It does not: the Root takes `value`/`onValueChange`. Measured after: `role="tablist"`, five `role="tab"`, ArrowRight and Home moving focus |
| `settings-language.tsx`     | ToggleGroup | one-of-many, drawn as pills                                                                                                                                                                                 |
| `editor/palette.tsx`        | ToggleGroup | one-of-many, with `aria-pressed` written by hand                                                                                                                                                            |
| `fault-body.tsx` (the log)  | Collapsible | a disclosure with a chevron and a boolean                                                                                                                                                                   |
| `chat-header.tsx` (search)  | Toggle      | a pressed state written as a ternary; `aria-pressed` true/false measured after                                                                                                                              |
| `stage-camera.tsx` (follow) | Toggle      | the same                                                                                                                                                                                                    |

### What is deliberately not on Base UI

**28 files are.** What is left: plain action buttons (open a sheet, hire, remove, copy, save, reload,
zoom, fit), plain text inputs and textareas, and layout. Nothing left holds toggle, selection, open or
disclosure state — that was the test, and grepping for `aria-pressed`, a boolean `useState` or an
`=== value` comparison outside the Base UI files now returns nothing.

`toast.tsx` stays at 15 lines rather than becoming a Provider, a Viewport and a Root whose namespace
alone measures 96 kB. `setup-token-field.tsx` and `settings-cred-form.tsx` stay plain: Base UI's Field
earns its place by wiring a label, a description and validation to a control, and these have their
captions drawn by a parent and no validation beyond a failed mutation. Base UI's `Button` exists, but
over `<button type="button">` it adds only the handling for rendering a non-button element.
