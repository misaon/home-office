# Simplifying the monorepo: the duplication that is actually there

The owner's task, 2026-09-15: simplify and modernise the code across the whole monorepo.

This plan is deliberately narrower than that sentence, and the reason is the measurement below. The
repository came out of the September 2026 deep audit and three redesign passes with very little rot
left: what it has is a handful of places where the same code was written twice during fast UI work.
Consolidating those is the whole of this task. Nothing here changes behaviour, and nothing changes a
pixel — except one line, named below, which the owner approved.

## What the survey found, and what it did not

Measured on 2026-09-15 against `32066f9`, over the 278 TypeScript files the repository owns (26 374
lines; `apps/desktop/.hutch` is a vendored toolchain and is excluded):

| Looked for                             | Found                                                         |
| -------------------------------------- | ------------------------------------------------------------- |
| `any`                                  | 0 (`typescript/no-explicit-any` is an error)                  |
| type assertions `as X`                 | 7, each with a comment saying why                             |
| `forwardRef`, `useMemo`, `useCallback` | 0 — the React Compiler does it                                |
| hand-rolled promise plumbing           | 0 — `Promise.withResolvers` at all 7 sites                    |
| manual resource cleanup                | 0 — `AsyncDisposableStack` at all 4 sites                     |
| dead exports, unused dependencies      | 0 — `knip` runs with `includeEntryExports` in `bun run check` |

So there is no modernisation backlog: the APIs in use are the current ones. What a duplicate-block scan
(6-line window, normalised whitespace, comments excluded) does find is nine groups, and those are the
work.

## The nine, and what each becomes

### 1. Four copies of the same modal — `packages/ui/src`

`design/dialog-sheet.tsx`, `design/setup.tsx`, `design/confirm.tsx` and `editor/overlay.tsx` each carry
their own `<dialog>` element, the same 20-word class string, the same `useEffect` that calls
`showModal()` and then `focus()` (with the same three-line comment explaining why), the same `onCancel`
that prevents the default and closes, and the same `CENTRE` room with the same outside-click handler.

→ One `Modal` in `design/dialog-sheet.tsx`. The backdrop is a prop, because `Confirm` wants its own.

### 2. `RoleCard` and `SourceCard` are the same card — `design/agent-roles.tsx`, `design/new-floor-card.tsx`

Line for line the same: the lifted border, the 30×30 icon tile, the title, the hint, the tick badge.
They differ in one utility (`gap-9` against `gap-10`) and in where their text comes from.

→ One `PickCard`. The gap stays a prop so neither card moves.

### 3. The same filter chip twice — `design/team-header.tsx`, `design/board-filters.tsx`

Same `CHIP` constant, same dot-label-count markup, same `pill()` tone, same hover.

→ One `FilterChips`, given its items and the selected key.

### 4. The same attachment fetch twice — `design/chat-thumb.tsx`, `design/lightbox.tsx`

Both hold a `url` state and run the same `live`-guarded `attachmentUrl()` effect.

→ One `useAttachmentUrl(attachment, enabled)`.

### 5. The chevron and the plus — eight call sites

Of the 42 inline SVGs in the UI, exactly one pair is byte-identical (the tick inside the two cards of
item 2, which that item removes). The rest are drawn once each and stay where they are. Two shapes
appear four times apiece with the same geometry and viewBox and differ only in size, stroke width and
class: the disclosure chevron (`settings-floor`, `settings-cred-row`, `team-row`, `fault-body`) and the
plus (`floor-menu`, `team`, `chat-toolbar`, `empty-office`).

→ `Chevron` and `Plus` in a new `design/icons.tsx`, taking the size and the stroke width they are drawn
at. The other 34 SVGs are not touched: they are not duplicates, and hiding a one-off shape behind a
component would cost more than it saves.

### 6. `removeProject` has `removeTask` copied inside it — `core/src/model/reduce.ts`

Eleven lines of session and task cleanup, written twice in the same file, ten lines apart.

→ `removeProject` calls `removeTask`.

### 7. Eight copies of the same unwrap — `core/src/commands/*`

```ts
const found = requireTask(model, taskId);
if (!found.ok) {
  return found;
}
const task = found.value;
```

in `tasks.ts` (×4), `review.ts` (×2) and `handoff.ts` (×2). `boss.ts` and `mail.ts` write the same shape
against `model.projects` instead.

→ `withTask` and `withProject` combinators in `commands/shared.ts`, which hand the entity to a callback
and return the `not_found` error themselves.

### 8. An import in the middle of a file — `design/settings-cred-form.tsx:17`

`import { useDesign }` sits below a `const`, which every other file in the repository puts at the top.

→ Moved.

### 9. One real bug — `design/confirm.tsx:122`

The dialog's class string carries six backdrop utilities that contradict each other:
`backdrop:bg-scrim-a74` **and** `-a78`, `backdrop-blur-[10px]` **and** `[12px]`, `animate-fade-280`
**and** `-240`. Tailwind decides such a conflict by emission order in the stylesheet, not by the order
written on the element, so what renders today is `a78` + `12px` + **280 ms** — two of Confirm's own three
values and one inherited by accident from `DialogSheet`.

→ The three Confirm was written with: `a78`, `12px`, **240 ms**. **This is the one visible change in the
whole task**: the confirm dialog's backdrop fades in 40 ms faster. The owner chose this over freezing
today's accident (2026-09-15).

## Considered and rejected

**A shared `exec` for `daemon/src/host-exec.ts` and `intake-github/src/gh.ts`.** The two do share about
ten lines of `Bun.spawn` plus a `Promise.all` that collects both streams and the exit code. But they have
different contracts — one returns the exit code, the other throws and honours a `Cancellation` — and
`@ho/core`, the only package both already depend on, is pure by rule (no I/O, no Bun globals), so sharing
would mean a new workspace package for twenty-five lines. That is not a simplification.

**Merging `design/settings-cred-form.tsx` with `design/setup-token-field.tsx`.** Both paste a secret, but
one is a settings row and the other a checklist step: different layouts, different invalidations,
different error surfaces. Only the two mutations overlap, and a hook for them would save four lines.

**Removing the `reviewer` and `clerk` roles.** They are reachable from the CLI and the review loop needs
one, so this is removing a feature, not removing rot — 22 files and the `images/agent/plugins/reviewer`
skill pack. Raised with the owner on 2026-09-15 and deliberately left out of this task.

## What the work came to

| Phase | Work                          | Commit    |
| ----- | ----------------------------- | --------- |
| 1     | Items 6, 7 (core), 8 (import) | `b5d01b9` |
| 2     | Items 1-5 (UI)                | `3723bb1` |
| 3     | Item 9 (the approved change)  | `1d37e02` |

Item 5 turned out weaker than the survey first reported, and the correction is worth keeping: the first
count treated repeated `<path d="...">` values as repeated icons, but the `<svg>` elements around them
differ in size and stroke width, so only **one** of the 42 is a byte-identical duplicate — the tick,
which item 2 removed anyway. The chevron and the plus are the same geometry at four sizes each, so they
moved into `icons.tsx` as components taking a size and a stroke width. The other 34 stay inline.

The line count is not the story either, and saying so is the point of writing it down. `packages/core`
lost five lines; `packages/ui/src` gained six, because 412 lines of repetition came out and three new
shared files put 178 back, doc comments included. What changed is that the "entity or `not_found`" rule
is written once instead of nineteen times, and that four modals, two pick cards, two chip rows and two
attachment fetches are one of each. The shipped bundle is 3 KiB smaller.

## Two things the verification found that the plan did not predict

### A production build that drops a class constant

`PickCard` rendered with no `relative`, no `flex`, no icon tile, and its tick positioned against the
viewport instead of the card's corner — a 29% pixel difference across six states. The source was
correct and so was the unminified build. In a `.tsx` module with **no import statements at all**,
`Bun.build` with `minify` and `reactCompiler` drops a module-level constant that a component
interpolates into a template literal; the minified bundle contains no trace of the string. Isolated by
toggling a single import and grepping the bundle. `pick-card.tsx` now imports its tick from
`icons.tsx`, which is both the natural home for a mark the office draws twice and an import the module
needs. Recorded in [docs/STACK.md](../STACK.md) with the boundaries of what is and is not affected.

### 642 bytes of stylesheet nothing selects

Naming the modal's backdrop classes in a constant makes Tailwind's scanner emit `.backdrop-blur-[10px]`
and `.animate-fade-280` bare as well as `backdrop:`-prefixed, and the office wears neither bare form.
`app.css` carries one `@source not inline(...)` for exactly those two; the `[14px]`/`[18px]` blurs and
`animate-fade-260`, which the lightbox and the camera bar do write bare, keep their rules. Recorded in
[audit/SUPPRESSIONS.md](../../audit/SUPPRESSIONS.md) as entry 11.

A smaller one came out of writing that down: a doc comment reading "the scrim and the blur" put a
`.blur` rule in the stylesheet. Tailwind scans every `@source` file as text, comments included.

## How it was verified

Two builds served side by side from two daemons on their own scratch `HO_HOME`s seeded from one copy of
the same database — the branch's parent (`32066f9`) on 47820, the branch on 47821 — and driven through
28 states of the office by headless Chrome over CDP, screenshotted at 1440x900 with animations
cancelled outright and the PixiJS canvas hidden, so the comparison covers every pixel of the viewport
at zero tolerance.

**26 of 28 byte-identical.** The two that differ are data, not code, and that is shown rather than
asserted: shooting the baseline against _itself_ produces the same 80 px in `sheet-agent` (a relative
timestamp) and the same 43 440 px in `usage-res` (Docker's disk figures).

The stylesheet is **rule-for-rule identical** to the baseline's, compared as sets of compiled rules.

The one intended visual change was measured directly rather than left to a screenshot with animations
switched off: the confirm dialog's `::backdrop` computed `animation-duration` is 0.28s on the baseline
and 0.24s on the branch, with `background-color: rgba(6, 6, 7, 0.78)` and `backdrop-filter: blur(12px)`
identical on both sides.

One process note worth keeping, because it nearly produced a false result: the first re-shoot reported
the same eight differences as the run before it. The restart of the branch daemon had failed — `pkill`
matched nothing, because `HO_HOME` is an environment variable and not part of the command line — so the
port was still serving the previous bundle, and the log said so. Check what the port actually serves
(`curl -s <url> | grep index-`) before believing a comparison.
