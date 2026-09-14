# Architecture and complexity pass, 2026-09-13

Owner task: go through the whole monorepo, file by file and flow by flow, improve and simplify the
architecture and the source, run a second independent wave with a stricter brief, fix everything found,
and open a pull request.

Two waves ran over every file in the repository: the first proposed the shape below, the second audited
the result — four independent readers over protocol/core/store, the daemon and its adapters, sim and the
office UI, and the apps, scripts, config and documentation. Every finding either landed as a change or is
recorded here with the reason it did not.

## What changed, by weight

**The office's envelopes.** The daemon holds a task's session until the office reports that its envelope
arrived, so a lost or duplicated report is a 30-second stall or a wrong animation. The bookkeeping is now
its own module (`packages/ui/src/office/envelopes.ts`) and counts envelopes per task instead of
remembering a set of task ids, because a task can carry two at once. Three ways a report used to go
missing are closed: a report is retried on the next connection when the socket was gone, envelopes whose
carrier left with a removed floor or a dismissed colleague are swept and reported, and the bridge now
mirrors the daemon's own walk-back rule exactly rather than a narrower variant that stalled every
`assigned → blocked` transition.

**The simulation's walls.** `compileLayout` assigned the blocked flag per object, so anything hung on a
wall — a window, a picture, an air conditioner, a hand dryer — punched a walkable hole through it. Doors
open a wall because they are doors; a lift car does because it is walked into (`walkable` in
`OBJECT_SPEC`); nothing else does. Measured on `layouts/base.json`, the office the editor drew: 648
blocked cells, outer walls solid.

**The daemon's shutdown.** `AsyncDisposableStack` unwinds in reverse, so the server's forced close ran
before `sessions.stopAll()` and every session lost the documented stdin → SIGTERM → SIGKILL escalation.
One deferred callback now states the order: sessions settle, then the socket layer closes.

**Runtime sessions.** A resumed ACP conversation never emitted `init`, so its record stayed `starting`
for its whole life and the resume-retry branch fired on every process exit. `init` is now emitted per
prompt, where it belongs. A runtime session closes in a `finally`, so a throwing prompt no longer leaks
the connection.

**The event log.** Drizzle is gone: `packages/store/src/index.ts` is one `bun:sqlite` module that applies
its schema at open and versions it with `PRAGMA user_version`, keeping the table shape the ORM created so
an existing database opens unchanged. A failed open closes its handle. A corrupt column names its row.

**Boundaries.** `@ho/core`, `@ho/sim` and `@ho/protocol` stopped publishing what nobody imports; `knip`
now checks entry exports too (`includeEntryExports`), so the barrels cannot drift back.

**The office UI.** One React tree instead of two, a shared `MapView` behind the office and the editor, a
real modal dialog (top layer, focus moved and restored, Escape handled by the browser), labelled controls
everywhere a select used to carry an English word, and every visible string in the typed dictionaries —
`cs.ts` is `typeof en`, so a missing Czech translation is a type error.

## Decisions worth recording

- **`Appearance` lost `spriteSet`.** The art was deleted on 2026-09-09; the field survived it. A stored
  `agent.created` that still carries one replays fine — Zod strips it.
- **`Task.parentId` was removed.** Delegated tasks keep their parent in `source.parentTaskId`; a manually
  created subtask in an older log loses the link, which nothing reads today.
- **`TaskSource.connector` stays a plain string** in the stored shape. Narrowing it would have made a
  previously written event unreadable, which is the one direction schema edits must not go.
- **`ho_report`'s `done` is honoured.** The tool's description promised three outcomes and the command
  routed on two; a worker that reports `done` is no longer sent to review anyway.
- **A failure reason stays home.** An acknowledgement posted to a GitHub issue carries the agent's own
  report and the links, never the diagnostic reason, which is assembled from process stderr.
- **`layouts/base.json` is committed.** `AGENTS.md` lists `layouts/` as part of the repository and the
  daemon reads it from there; leaving the only drawn office untracked was the one state that was wrong
  either way.

## Not done, deliberately

- The office draws a plain dot per character. Emotion, activity and facing are simulated and nothing
  renders them — a known gap, waiting on art, not an oversight.
- The editor's dictionary still ships in the production bundle (~190 strings) although its code does not.
  Splitting it into its own namespace is worth doing when the editor grows, not before.
- Tests remain out of scope until the owner asks for them.

## Verification

`bun run check` green (typecheck over six programs, `oxlint --deny-warnings`, `oxfmt --check`, `knip`,
the production UI build). The office was driven end to end against a scratch daemon in the browser: a
floor created through the dialog, an agent hired, the language switched to Czech, a chat message walked
from the reception to the boss by Lola and reported exactly once — measured in the daemon log, one
`envelope delivered by the office` per envelope, the session scheduled the moment it arrived.
