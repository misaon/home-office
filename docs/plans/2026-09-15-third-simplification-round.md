# The third round: what was left, and why it is not much

The owner's task, 2026-09-15: go through the whole repository and simplify the source significantly.

This plan reports that **the "significantly" is not available**, says what the measurement was, and then
does the part that is. Two earlier rounds already took the obvious work:
[the first](2026-09-15-consolidate-duplication.md) found nine groups of repeated text,
[the second](2026-09-15-second-simplification-round.md) ten items of state nobody reads and work nobody
needs. Both were measured and both kept a "considered and rejected" section. A third pass driven by
taste rather than evidence would mostly undo their decisions.

## What the survey found

Measured 2026-09-15 against `a3660e3`, over the source the repository owns. `apps/desktop/.hutch` is a
generated, gitignored toolchain of 34 848 lines and is excluded throughout.

| Looked for                                  | Found                                                                |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Source size                                 | 26 931 lines in 281 files; median file ≈ 103 lines                   |
| Files over the 300-line lint limit          | 0 — the largest is `daemon/sessions.ts` at 289                       |
| Functions over the 120-line limit           | 0 — oxlint fails the build on one                                    |
| `any`, dead exports, unused dependencies    | 0, 0, 0 — enforced by oxlint and by knip with `includeEntryExports`  |
| Cross-file duplicate blocks (6-line window) | One group worth acting on; the rest are import lists and coincidence |
| Small files with exactly one importer       | 65 files, 2 947 lines — **but most are load-bearing, see below**     |

### The fragmentation is mostly the linter's own doing

Sixty-five files look like needless fragments until you ask why each exists. `daemon/floor-jobs.ts`
exists so `launch.ts` stays under `import/max-dependencies` at 20. `protocol/usage.ts` exists so
`domain.ts` stays under 300 lines. `rpc/tasks.ts` cannot return to `rpc/router.ts` without pushing it
over the same limit. Merging those would fight rules that are deliberate and written down in
[CONVENTIONS.md](../CONVENTIONS.md).

Of the 65, **33 are UI fragments (1 500 lines) whose single caller is the same concept** — a header
split across five files, a toast the app renders once. Those are the real ones.

### The UI is the riskiest place to touch

Two traps are already recorded from measurement: a `.tsx` module with no import statements loses
module-level constants under the production minifier, and proving a UI change pixel-neutral takes two
daemons, 28 states and headless Chrome over CDP. Merging cannot hit the first trap — a merged file
always has imports — but it earns the caution.

## Owner decision, 2026-09-15

Four options were put to the owner: the measured safe set; relaxing the lint limits so fragmentation
could genuinely collapse; cutting features instead of refactoring; or reporting and changing nothing.
The owner chose **the measured safe set**, on a clean branch rather than stacked on the two open pull
requests.

## What changed

### 1. One mutation hook instead of twelve error handlers

Twelve `useMutation` call sites each wrote out

```ts
onError: (error: Error) => {
  flash(error.message);
},
```

and **every one of the twelve was character-for-character that** — no site did anything else on
failure. `useOfficeMutation` in `design/store.ts` supplies it once. Its options type omits `onError`,
so a site cannot quietly grow a second way of failing; giving one its own handler becomes a deliberate
edit rather than an omission. Nine files also dropped the `flash` selector they took only for this.

### 2. Thirteen fragments merged into the component they serve

| Host               | Absorbed                                                    | Result    |
| ------------------ | ----------------------------------------------------------- | --------- |
| `header.tsx`       | `header-brand`, `connection`, `header-tabs`, `header-floor` | 232 lines |
| `settings.tsx`     | `settings-language`, `settings-cred-row`                    | 166       |
| `app.tsx`          | `overlays`, `toast`                                         | 106       |
| `team.tsx`         | `team-header`                                               | 130       |
| `usage.tsx`        | `usage-breakdown`                                           | 118       |
| `board-header.tsx` | `board-filters`                                             | 113       |
| `chat-message.tsx` | `chat-thumb`                                                | 77        |
| `sheet-agent.tsx`  | `sheet-agent-status`                                        | 69        |

Every host stays well under the 300-line limit.

**Not merged, though the importer count invited it:** `board.tsx`, `team.tsx` and `usage.tsx` each have
`panel.tsx` as their only importer, but they are three separate panels and one file holding all of them
would be worse to read, not better. The same for anything crossing the `design/` ↔ `office/` ↔ `editor/`
boundaries, and for the five non-UI files whose separation the lint limits require.

## Verified, 2026-09-15

`bun run check` passes — six compiler programs, oxlint with warnings denied, oxfmt, knip, the schema
check and the production UI build.

Every moved component body was compared against its pre-merge version in git:

```
verbatim  header-brand.tsx -> header.tsx
verbatim  connection.tsx -> header.tsx
verbatim  header-tabs.tsx -> header.tsx
verbatim  header-floor.tsx -> header.tsx
verbatim  overlays.tsx -> app.tsx
verbatim  toast.tsx -> app.tsx
verbatim  sheet-agent-status.tsx -> sheet-agent.tsx
verbatim  chat-thumb.tsx -> chat-message.tsx
verbatim  board-filters.tsx -> board-header.tsx
verbatim  settings-language.tsx -> settings.tsx
verbatim  settings-cred-row.tsx -> settings.tsx
```

Two moved bodies are not byte-identical, and both differences were chased down: `usage-breakdown`'s
`export type Row` became `type Row` because it is now local and knip said so, and `team-header`'s
function signature was reflowed onto one line by oxfmt. Neither touches rendered output.

Against the known minifier trap, every merged file still carries imports (9, 16, 7, 6, 6, 10, 8 and 15
of them), and distinctive class strings from the moved components — `animate-breathe`,
`tracking-brand`, `ease-spring-far`, `tracking-caps-wider` — are present in the production bundle.

**Not verified: the 28-state pixel harness was not run.** The argument for pixel-neutrality is that
every move was verbatim and the two exceptions are accounted for above; that is an argument, not a
measurement. Say so if you want the harness run before this merges.

## The result, measured

|                       | Before | After      |
| --------------------- | ------ | ---------- |
| Source files          | 281    | **268**    |
| Source lines          | 26 931 | **26 869** |
| `ui/src/design` files | 75     | **62**     |

Thirteen files and 62 lines. The line count is the honest headline: **merging files removes boilerplate,
not logic**, and there was no logic left to remove. What it buys is thirteen fewer files to open and one
error path instead of twelve.

## If "significantly" still matters

Two levers remain, and both are decisions rather than cleanups:

- **Raise the lint limits.** `max-lines` at 300 and `import/max-dependencies` at 20 are what keep
  roughly twenty files apart. Raising them would let those collapse — at the cost of larger files, which
  are harder for both people and agents to hold in view. The limits are deliberate; changing them is a
  conventions change.
- **Cut features.** The internal office editor, GitHub intake and the private container engine are each
  a few hundred lines with their own protocol surface. Removing any of them would shrink the source far
  more than any refactor can. That is a product decision and needs the owner's word on what is no longer
  wanted.
