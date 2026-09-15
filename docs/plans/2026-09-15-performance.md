# Where the office actually spends time

The owner's task, 2026-09-15: go through the whole monorepo for performance and bottlenecks, and make
the application fast and easy on the hardware.

Everything below was measured. `bun run bench` (`spikes/bench`) is the harness for the pure paths; the
browser numbers come from a real daemon serving a real build, read out of `performance.getEntriesByType`.
Nothing here is a guess about what "might" be slow — two things were, four were not, and saying which
is half the value.

## The two that were

### 1. Six hundred kilobytes of stylesheet, and eighty-eight percent of it fonts

The office shipped **607 802 bytes of CSS**, every byte of it blocking the first paint. Tailwind's own
output is **74 112 bytes**. The difference was the three vendored typefaces, base64'd into the bundle.

Two causes, compounding:

- **Bun's CSS bundler inlines every `url()` it can resolve as a `data:` URI**, with no option to turn it
  off ([oven-sh/bun#28307](https://github.com/oven-sh/bun/issues/28307), open since March 2026).
- **`fonts.css` declared the same eleven files under twenty-seven `@font-face` rules** — one per weight
  the design uses, all pointing at the same single-weight file. So each file was encoded two or three
  times over. Measured: 11 distinct payloads across 27 occurrences, 532 736 bytes of base64 of which
  **325 732 was the same bytes repeated**.

Both are fixed. One face per file with a weight range — the browser picks the same file for the same
text either way — and the `@font-face` rules never reach the bundler: the build lifts them into their
own stylesheet that points at the files under a content hash, and `index.html` links it.

|                              | Before              | After                                     |
| ---------------------------- | ------------------- | ----------------------------------------- |
| CSS blocking the first paint | 607 802 B           | **70 935 B**                              |
| Fonts                        | inline, unavoidable | 2 files, 52 224 B, parallel and cacheable |

The second row is `unicode-range` finally doing its job: the browser fetched **two** subsets for the
glyphs on screen, not eleven, and never touched Cyrillic, Greek or Vietnamese. Cached forever after the
first visit, because the file names carry a content hash and `static.ts` now marks `woff2` immutable.

A security side effect: `font-src` no longer needs `data:`. The CSP is `font-src 'self'`.

### 2. A full scan of every session, per character, per frame

`captionOf()` runs for every visible character on every frame, and inside it `activeSessionOf` was
`[...snapshot.sessions.values()].find(...)` — materialising an array of the floor's whole session
history to find one entry, twelve times a frame, thirty frames a second. An idle colleague is the worst
case: there is nothing to find, so the scan always runs to the end. Sessions accumulate with history.

Measured, twelve characters, sessions all ended but one per agent:

| Sessions | Scan, per frame | Per second at 30 fps | Indexed      |
| -------- | --------------- | -------------------- | ------------ |
| 100      | 0.028 ms        | 1 ms                 | 0.003 ms     |
| 1 000    | 0.136 ms        | 4 ms                 | 0.009 ms     |
| 10 000   | **0.808 ms**    | **24 ms**            | **0.035 ms** |

The snapshot now carries `activeByAgent`, built when the sessions collection changes from
`activeSessions` — which holds only the live ones, so it walks two or three entries, not ten thousand.

This revisits a decision the second simplification round recorded as rejected: giving the UI's snapshot
the read model's indexes, judged then as "more machinery than it removes". That judgement was about
filtering projects in `live.ts`. This is a different path — thirty frames a second — and the measurement
above is the new evidence. The earlier rejection stands for what it covered.

## The four that were not

Worth writing down, so nobody optimises them on a hunch:

| Path                                          | Measured                                               | Verdict                             |
| --------------------------------------------- | ------------------------------------------------------ | ----------------------------------- |
| Event replay (daemon start, every page load)  | 30 013 events in **3.35 ms**, 0.11 µs/event            | Linear and cheap. Not a bottleneck. |
| `planSessionStarts` (runs on relevant events) | **0.178 ms** at 10 000 tasks                           | Not a bottleneck.                   |
| `sim.tick()` (the office's own frame)         | **0.022 ms** at 120 actors — 0.1 % of the 33 ms budget | Not a bottleneck.                   |
| Read model in memory                          | **6.0 MiB** at 10 000 tasks and sessions               | Not a problem.                      |

And one that looked like the biggest thing in the bundle and is not: **`simple-icons` accounts for 51.6 %
of the source the bundler reads** (5 125 KiB of 9.7 MiB) because the package is a barrel of thousands of
brand marks. The office names three of them. Tree-shaking works: the minified bundle holds **14 icon
literals**, and greps for `Facebook` and `Slack` return zero. Source read is not bytes shipped.

The JavaScript that is shipped — 1 518 KiB — is pixi.js (1 526 KiB of source) and react-dom (1 176 KiB).
Those are load-bearing. Shrinking them means dropping the drawn office or React, which is a product
decision and not a cleanup.

The Pixi ticker was already capped at 30 fps and already stopped while the document is hidden.

## Verified, 2026-09-15

`bun run check` passes. `bun run bench` prints the tables above. The font change was checked in a browser
against a daemon serving a real production build — not against the working tree, for the reason in the
next section:

```
computedFont : "Instrument Sans", system-ui, sans-serif
fontsLoaded  : Instrument Sans 400 600, Space Grotesk 500 700
cssBytes     : 70935
woff2Fetched : 2
woff2Bytes   : 52224
console errors: none
```

So the faces load, the weight ranges resolve, the tightened CSP blocks nothing, and the page renders in
the real typeface rather than silently falling back.

### A trap worth recording

The first three attempts to verify this showed the _old_ bundle, with `data:` fonts now blocked by the
new CSP. The cause was not the change: **`bun run ui:watch` was running**, and a long-lived watcher keeps
executing the copy of `scripts/ui-build.ts` it started with. It rebuilt `packages/ui/dist` in development
mode — 21 MB of unminified JS, a `dev-revision.txt` beside it — over every production build, with the
font lift its older script did not have.

The tell is `dev-revision.txt` in `dist`. Verify a production UI change by building to `HO_UI_OUTDIR` and
pointing the daemon's `ui.dir` at it, or restart the watcher first.

## Not done

- **A frame profile of the Pixi renderer itself.** The simulation's own tick is 0.1 % of the frame, but
  what Pixi spends drawing it was not measured; that needs a GPU trace rather than a timer.
- **Snapshots or event-log compaction.** Replay is cheap enough today that neither is needed, and
  `ARCHITECTURE.md` already records that startup replay grows with retained history. The number to watch
  is above: at 30 013 events it is 3.35 ms.
