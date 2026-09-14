# The updated drawing, ported

The owner redrew the office and left the new file as `home-office-updated.html` (501 820 bytes,
md5 `3cc8cd392af5c797aa6ba2831c15535f`). It replaced `docs/design/Home Office.html`, which had carried
the previous drawing and against which `packages/ui/src/design` was first written. Both copies were
byte-identical, and both are deleted now that the design is in the app: the office is the drawing.

## What changed between the two drawings

The old and the new bundles were extracted to JSX and diffed section by section, with indentation and
hover-class names normalised away. Six top-level sections are new and everything else is either
identical or gated differently:

| Section                               | Old → new                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------- |
| header                                | the floor picker and the tab bar are gated on there being floors            |
| empty office                          | new: a whole screen for an office with no floors                            |
| stage                                 | identical                                                                   |
| chat                                  | new: a banner while the boss runs, with Stop; drag a file onto the composer |
| board                                 | identical                                                                   |
| team                                  | the inline hire form is gone; hiring opens a dialog                         |
| usage                                 | identical                                                                   |
| settings                              | identical                                                                   |
| agent sheet                           | read-only now: status, recent work, and a way into the dialog               |
| task sheet                            | identical                                                                   |
| agent dialog                          | new: hire or change a colleague, over the whole office                      |
| new floor                             | new: the add-project dialog, redrawn                                        |
| fault                                 | new: three full-screen states for an office that cannot work                |
| confirm                               | new: the office's single "are you sure"                                     |
| setup, lightbox, editor drawer, toast | identical                                                                   |

The hover stylesheet grew from 30 rules to 36. All 36 were compared declaration by declaration against
`design.css`: same names, same values; the only differences are `oxfmt`'s `rgba()` spacing and hex case.

## What the port does that the drawing could not

The drawing is a picture of an office, so some of it had to be wired to things the daemon actually knows.
Where the drawn condition matched a real one the drawing's own words were kept; where it did not, the
design was kept and the words were made true.

- **Fault screen.** The drawing's three variants are driven by a prop. Ours are driven by what the office
  can detect: the daemon refuses this page (`unauthorized`/`rejected`), the daemon stopped answering
  (offline for longer than 12 s, so a reconnect no longer explains it), or no container engine is
  running (`system.doctor` says the provider is not ok). The engine variant keeps the drawing's copy
  verbatim, because the condition is the same one it was drawn for. The report line is
  `Report <8 hex of the log> · <time>`; the drawing's build number is not shown, because this page has
  no honest way to know it. It stays out of the way while the first-run checklist is open.
- **Agent dialog.** The drawing offers two roles and three selects; the office has four roles, and its
  provider catalogue (`PROVIDERS`) decides which models, effort levels and sign-ins each provider
  offers. The dialog reads the catalogue, so it cannot offer a combination the daemon would refuse, and
  the four role cards are the drawn card with two marks added in the same hand. A floor's boss is fixed —
  the daemon refuses a second one and refuses to demote the first — so the boss card names who holds it
  rather than offering the drawing's swap.
- **New floor.** The drawn dialog, with the repository checked by the daemon before Create is enabled.
  When other floors already have staff, a block appears under the preview to import them; the drawing
  was made against a single-floor office and has nothing to say there, so nothing is drawn when nothing
  can be imported.
- **Stop.** The drawn Stop button needed something to stop, so the daemon gained `sessions.stop`: it
  aborts that session's controller — the same path the wall-time budget takes — and returns without
  waiting for the sandbox to come down. The run throws, its task is blocked for explicit resumption,
  and the office says so.
- **Characters.** The drawing puts a name-and-status pill under every puck and a slow ring around the
  ones at work. The office's PixiJS scene now draws both: the pill keeps its drawn size while the floor
  zooms under it, and the ring runs the stylesheet's own `ring` curve on the office ticker.

## Verified

Every screen was driven in headless Chrome against a private daemon (its own `HO_HOME`, its own port)
and held against the drawing opened from the file system.

- Hover rules: 36 of 36 identical in name and value (compared programmatically).
- Screens photographed and compared: empty office, chat (idle, working, drop), board, team, usage,
  settings (collapsed, floor expanded, credential expanded), agent sheet, agent dialog (new and edit),
  new floor, floor picker, task sheet, confirm (danger and safe), fault (engine offline, with the log
  open), setup.
- `sessions.stop` was pressed from the office against a live session and the office said so.
- `bun run check` passes: six typecheck programs, `oxlint --deny-warnings`, `oxfmt --check`, `knip`,
  and the production UI build.

Not verified live: the `crash` and `connection refused` fault variants were not reproduced in a browser —
they need a daemon that dies or refuses mid-session. Their shell is the same component as the engine
variant, which was verified; only the words and the two checks differ.
