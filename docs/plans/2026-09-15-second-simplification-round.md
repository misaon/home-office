# The second round: state nobody reads, work nobody needs

The owner's task, 2026-09-15, after the first round: simplify again, and more thoroughly.

The first round looked for repeated _text_ and found nine groups of it. This one looked for repeated and
unnecessary _meaning_: state the office keeps and never reads, work it redoes every render, and one
configuration knob that promises behaviour nothing implements. Everything below is measured, and each
row names what the measurement was.

## What the survey found

| #   | Where                                                 | Measured                                                                                               |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `ui/src/design/store.ts` `openIntake`, `openServices` | Declared and initialised; **zero** references anywhere else in the tree — never read, never written    |
| 2   | `ui/src/store.ts` `lastError` + `setError`            | `office/scene.ts` writes it twice when the canvas fails; **nothing ever reads it**                     |
| 3   | `attachOpen` + `usageOpen` + `openSelect`             | One mutually exclusive popover kept as three fields, closed by hand in four separate places            |
| 4   | `design/store.ts` `confirm`                           | `confirm(ask)` is exactly `set({ ask })`                                                               |
| 5   | `design/live.ts` `useFloor()`                         | Builds **every** floor — team, cards and messages, each sorted — to return one                         |
| 6   | "the agent's active session"                          | The same four-line scan written three times: `live.ts:78`, `live.ts:174`, `office/scene.ts:48`         |
| 7   | `design/data.ts` `Message.img`                        | Computed in `messageOf`; **zero** readers                                                              |
| 8   | `design/live.ts` time helpers                         | `clock`/`stamp` and `since`/`ago` are two pairs over one computation                                   |
| 9   | `core/src/model/queries.ts:17`                        | Comment claims "the UI's immutable snapshot fits too"; the snapshot carries no indexes, so it does not |
| 10  | `daemon/src/config.ts` `retention.idleStopMinutes`    | Declared with a default of 10; **no code reads it**                                                    |

Item 2 is the one that is not merely tidying. `setError` exists to tell the human something, and the
wiring was never finished: when the PixiJS scene fails to start or fails a frame, the office records the
message into a field no component renders. The failure is silent. The office already has a way to say
something once — `flash`, the toast — so those two sites will use it, and the field and its setter go.
**That is a visible change**: a scene failure that showed nothing will now show a toast.

Item 3 is the one with a bug class behind it. The three fields are already treated as one thing — the
scrim in `app.tsx:75` tests all three together and clears all three together, `chat-toolbar.tsx:64` and
`select-field.tsx:56` each clear the other two by hand — so the invariant "only one of these is open"
is maintained in four places and can be forgotten in a fifth. One `popover` field cannot be forgotten.

## What the office drew its shapes from stays

`design/data.ts` and `design/live.ts` are an anti-corruption layer: the drawing speaks of three lanes and
two moods where the domain has nine task states and five session states, and this is the one place that
translates. The owner chose (2026-09-15) to keep the boundary and repair what is inside it, which is
items 5–8. The layer's 291 lines and its 31 importers stay.

## Considered and rejected

**Removing the write-only `Session.sandboxId` and `MailItem.receivedAt`.** Both are set and never read —
`sandboxId` is threaded through three packages to get there. But they are not dead code: they are the
event log's record of which container a session ran in and when a piece of mail arrived. Deleting
recorded facts from an append-only log to save four lines of plumbing is the wrong trade, and the audit
values that log as evidence.

**Giving the UI's `Snapshot` the read model's indexes** so `live.ts` could call `membersOf`, `tasksOf`
and `sessionsOfAgent` instead of filtering maps by hand. It would make item 9's comment true and share
one set of queries between daemon and office — but it means copying and revision-tracking four more maps
so that a handful of projects can be filtered without a scan. That is more machinery than it removes.
Item 9 fixes the comment instead, and item 6 deduplicates the one scan that is genuinely written three
times.

**Merging the small single-consumer components** — `header-brand.tsx` (14 lines), `overlays.tsx` (12),
`toast.tsx` (16), `sheet-agent-status.tsx` (20). A file count is not a complexity measure, and each is
one named thing used in one place, which is what a component is for.

**Collapsing `credOpen` and `floorRowOpen` into the popover of item 3.** They are accordion sections in
different panels, not mutually exclusive with anything, and folding them in would change which rows can
be open at once.

## What the work came to

| Phase | Work                                   | Commit    |
| ----- | -------------------------------------- | --------- |
| 1     | Items 1, 3, 4 — the design store       | `11e9796` |
| 2     | Items 2, 6 — the swallowed scene error | `245fb92` |
| 3     | Items 5, 7, 8, 9 — the repeated reads  | `fb0e3f7` |
| 4     | Item 10 — the configuration knob       | `7329213` |

Two things the survey got wrong, corrected while doing the work:

**Item 3 was understated.** `attachOpen` is not one of three fields holding one fact — it is _never set
to true_ at all. The attach button opens the operating system's file dialog and has not opened a menu of
its own for some time, so the four places that cleared the field were clearing nothing and the scrim's
first condition could never be satisfied. Three fields became one; one of the three was already dead.

**Item 4 was wrong about which of the two is redundant.** `confirm(ask)` is indeed `set({ ask })`, but
it names what the office is doing and reads better than the patch would at its five call sites, so it
stays. What is genuinely redundant is `set` and `update`: zustand's own setter already takes either a
partial or a function of the state, so the store wrapped the identical call twice. `update` is gone.

The line count went **up** by six across `packages` and `apps`. That is the honest number and it is not
the point: the round removed four fields of state, one setter, one configuration knob, a whole floor's
worth of work per render, and three copies of one scan — and added a toast, two dictionary keys and the
comments that explain the above.

## Verification

Two builds served side by side from two daemons on scratch `HO_HOME`s seeded from one copy of the same
database — `61085a0` on 47820, this round on 47821 — driven through 28 states of the office by headless
Chrome over CDP at 1440×900, animations cancelled, canvas hidden, every pixel compared at zero
tolerance.

**All 28 byte-identical.** Both known data drifts came out clean this time because the two runs were
shot back to back: the relative timestamp and Docker's disk figures did not move between them. The
compiled stylesheet is rule-for-rule identical to `61085a0`'s.

Item 2 is not in the 28 states — it needs a scene that fails — so it was measured directly in a
development build by replacing `bridge.tick` with a function that throws. The throwing tick was called
**59 times**; the office said it **once**: "The office could not be drawn: forced scene failure". The
first attempt at that probe reported no toast, and the probe was wrong, not the code — it looked only
at leaf elements. Read the body text before concluding a thing did not happen.
