# The dependency audit: what September 2026 actually offers, and what it does not

The owner's task, 2026-09-15: audit every npm library the repository uses, research online whether a
more modern, more efficient or more fashionable alternative exists as of September 2026, adopt anything
genuinely better, and wire it up the way its own documentation asks. No outdated and no unfashionable
packages.

The sweep was run against the registry and against this codebase on **2026-09-15**. It found **no
outdated package in the sense the task feared** — nothing deprecated, nothing abandoned, nothing
superseded — and one thing worth removing that no alternative library would have fixed.

## Method

The September 2026 deep audit already swept 43 library candidates (`audit/DEPENDENCIES.md`, ADR 005) on
2026-09-08. This is a re-check one week later against a tree that has since lost `drizzle-orm`,
`drizzle-kit`, `sharp`, `type-fest`, `proper-lockfile` and `bun-plugin-tailwind` to the architecture
simplification, plus fresh research on whether the remaining choices are still the ones a 2026 project
would make.

```
GET registry.npmjs.org/<pkg>                       → latest, publish date, dist-tags
GET registry.npmjs.org/<pkg>/<installed version>   → deprecated?           (210 versions)
GET api.npmjs.org/downloads/point/last-week/<pkg>  → adoption
GET api.github.com/repos/<owner>/<repo>            → archived, pushed_at
bun outdated --filter '*'                          → what the workspaces are behind on
```

Platform binaries (`@oxc-*`, `@oxlint/*`, `@oxfmt/*`, `@tailwindcss/oxide-*`, `lightningcss-*`,
`@parcel/watcher-*`, `@typescript/typescript-*`, `@emnapi/*`, `@napi-rs/*`) were excluded from the
deprecation scan; they are per-arch artefacts of packages that were themselves checked.

## The headline

**Zero deprecated packages across 210 installed versions.** Not one direct dependency, not one
transitive one. Nothing in the tree is unmaintained: the quietest package by publish date is
`tinyqueue` (last release 2024-07-06), whose repository was pushed 2026-04-05 and which does one
complete thing.

## What is behind, and by how much

`bun outdated --filter '*'`, 2026-09-15. Every one is a patch or minor.

| Package                            | Pinned           | Latest  | Published  |
| ---------------------------------- | ---------------- | ------- | ---------- |
| `zod`                              | 4.5.4            | 4.6.5   | 2026-09-13 |
| `react`, `react-dom`               | 19.2.8           | 19.3.0  | 2026-09-09 |
| `@types/react`, `@types/react-dom` | 19.2.18 / 19.2.7 | 19.3.0  | 2026-09-09 |
| `@orpc/{client,contract,server}`   | 1.15.0           | 1.15.1  | 2026-09-15 |
| `react-i18next`                    | 17.0.13          | 17.0.14 | 2026-09-13 |
| `knip`                             | 6.35.0           | 6.35.1  | 2026-09-09 |
| `oxfmt`                            | 0.67.0           | 0.68.0  | 2026-09-14 |

And in the agent images, which `bun outdated` does not see because `images/*` are not workspaces:

| Package                          | Pinned  | Latest  | Published  |
| -------------------------------- | ------- | ------- | ---------- |
| `@playwright/mcp`                | 0.0.80  | 0.0.81  | 2026-09-14 |
| `@agentclientprotocol/codex-acp` | 1.10.0  | 1.11.0  | 2026-09-09 |
| `@google/gemini-cli`             | 0.58.0  | 0.59.0  | 2026-09-08 |
| `opencode-ai`                    | 1.18.29 | 1.18.31 | 2026-09-14 |

Current already: `typescript` 7.0.2, `oxlint` 1.83.0, `oxlint-tsgolint` 7.0.2001, `tailwindcss` and
`@tailwindcss/cli` 4.3.3, `pixi.js` 8.20.1, `zustand` 5.0.15, `@tanstack/react-query` 5.102.8,
`i18next` 26.4.2, `pino` 10.3.1, `electrobun` 2.0.1, `@types/bun` 1.4.2, `tinyqueue` 3.0.0,
`@agentclientprotocol/sdk` 1.4.0, `@modelcontextprotocol/sdk` 1.30.0, `chrome-devtools-mcp` 1.9.0.

`oxfmt` 0.68.0 was checked before adopting, because a formatter bump can rewrite the whole tree:
`bunx oxfmt@0.68.0 --check` reports **"All matched files use the correct format"** on 376 files. The
bump changes nothing about how this repository looks.

React 19.3.0 is not only a patch: it makes `<ViewTransition>` and Fragment Refs stable, and transitions
now render independently instead of being entangled into one render. The office animates its own
panels and does not adopt View Transitions in this change; the bump is taken for the transition fix and
to stay current.

## The one replacement: `yoctocolors` → `node:util`

ADR 005 (2026-09-08, item 6) chose `yoctocolors` over `picocolors` on the activity criterion. What that
comparison did not consider is that the platform now does it: `styleText` from `node:util` is
implemented in Bun 1.4.2.

The first draft of this document claimed the swap also fixed a bug — that the CLI's
`process.stdout.isTTY && NO_COLOR === undefined` gate would paint a terminal with no colour support.
**That claim was wrong and the measurement withdrew it**: `yoctocolors` runs its own colour detection
inside each function, so the hand-written gate was never the only one. Measured on Bun 1.4.2,
2026-09-15, the old code and the new agree in every condition:

| Condition                                | `paint ? green : plain` | `styleText("green", …)` |
| ---------------------------------------- | ----------------------- | ----------------------- |
| stdout piped (not a TTY)                 | plain                   | plain                   |
| TTY, `TERM=dumb`                         | plain                   | plain                   |
| TTY, `TERM=xterm-256color`               | `\e[32m…\e[39m`         | `\e[32m…\e[39m`         |
| TTY, `TERM=xterm-256color`, `NO_COLOR=1` | plain                   | plain                   |

So this is not a repair. It is one direct dependency leaving the tree, the hand-written gate going with
it, and the rule the CLI wants — colour on a colour-capable terminal, never under `NO_COLOR` — becoming
the runtime's job. The five paint functions and all nineteen call sites keep their shapes.

Verified inside a `bun build --compile --minify` binary as well, because a compiled executable is how
the CLI ships and `node:util` in a single-file build is exactly the sort of thing that silently is not
there: the compiled probe printed the same four results.

## What the research says to keep, and why each is a merit decision

Each row below is a case where a newer or louder alternative exists and the answer is still no. Weekly
download figures are from the npm API on 2026-09-15.

| Ours                                    | Loudest 2026 alternative       | Why ours stays                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **oRPC** 1.15.1 (0.87 M/wk)             | tRPC v11                       | oRPC is already the newer one: it handles ~4.3× the requests over HTTP and ~4.8× over WebSocket, type-checks 32 % faster, and is 14.5 kB against tRPC's 25.6 kB. It also takes Standard Schema, which tRPC does not.                 |
| **Zod** 4.6.5 (209 M/wk)                | Valibot 1.5.0 (14 M/wk)        | Measured here: the same four-field schema is 86 348 B minified under Zod and 3 671 B under Valibot. But Zod sits in nine packages, most of them daemon-side where bytes are free, and the UI bundle is 1.27 MB — 82 kB is 6 % of it. |
| **i18next** 26.4.2 + react-i18next      | Paraglide JS 2.25.2 (431 k/wk) | Compiler-based and tree-shakeable, −73 kB. Against that: ~40 `useTranslation` call sites, Czech plural agreement riding on i18next's `_one/_few/_many` suffixes, and 37× less adoption.                                              |
| **Pino** 10.3.1 (36 M/wk)               | LogTape 2.3.5 (0.32 M/wk)      | LogTape is zero-dependency and genuinely active (pushed 2026-09-14), but pino is used in exactly one file here, its `destination().reopen()` is what the 8 MiB rotation is built on, and pino's own repo was pushed 2026-09-05.      |
| **Zustand** 5 + **TanStack Query** 5    | Jotai 3.0.0, TanStack Store    | This pairing _is_ the 2026 consensus for client state plus server state. Nothing to move to.                                                                                                                                         |
| **TinyQueue** 3.0.0 (8.3 M/wk)          | heap-js (6.5 M/wk)             | 26 months without a release because it is finished: one binary heap, ISC, zero dependencies, repo pushed 2026-04-05. Swapping it for a busier package buys nothing.                                                                  |
| **PixiJS** 8.20.1, **Electrobun** 2.0.1 | Phaser 4, Tauri, Electron      | Re-examined and unchanged from ADR 002 / the stack review; neither has become the wrong choice in a week.                                                                                                                            |
| `@tailwindcss/cli` in a Bun plugin      | `bun-plugin-tailwind` 0.1.2    | The official plugin's last publish is **2025-10-09**, eleven months ago; our own 20-line `onLoad` plugin is newer than the thing that would replace it.                                                                              |

One observation that is not actionable but is worth recording: `@modelcontextprotocol/sdk` drags
Express 5 and its fourteen middleware packages into the lockfile for an HTTP transport this daemon does
not use, plus `zod-to-json-schema`, which Zod 4 made redundant with its own `toJSONSchema`. That is
upstream's tree, not ours, and nothing here imports it.

## The phases

| Phase | Work                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------- |
| 1     | The eleven catalog pins, `bun install`, `bun run check`                                            |
| 2     | `apps/cli/src/output.ts` onto `node:util` `styleText`; `yoctocolors` out of the catalog            |
| 3     | The four image pins, with their `package-lock.json` trees rebuilt                                  |
| 4     | `docs/STACK.md`, `docs/PLAN.md`, this document                                                     |
| 5     | Verification: `bun run check`, the CLI's colour behaviour, and the office compared pixel for pixel |

Phase 5 matters more than usual because React 19.2.8 → 19.3.0 is a UI change, and because the office is
verified by image and not by test.

## What the verification found

**`bun run check` green** after each phase: six typecheck programs, `oxlint --deny-warnings`,
`oxfmt --check`, knip, production UI build.

**The office, 28 states, zero tolerance.** Two daemons on scratch `HO_HOME`s seeded from one copy of
the same database — `2773f41` on 47830 from its own worktree, this change on 47831 — driven by headless
Chrome over CDP at 1440×900, animations cancelled, canvas hidden. Each port was checked for which
bundle it actually serves (`index-nt8msrrw.js` against `index-xzsjjyn8.js`) before anything was
believed.

27 of 28 came back byte-identical on the first pass. The 28th, `usage-res`, differed by exactly
43 440 px — and **the cause was the harness, not the change**. Shot three more times per side at the
same timing, the third run failed on the _baseline_ too, with the identical 43 440 px: the Docker
engine card had not finished loading and the panel still read "checking…". Given a longer wait, both
sides are identical. The same figure appeared in the strict-linting round a day earlier and was
recorded there as Docker disk-figure drift; that explanation was wrong, and this is the right one.

**The compiled stylesheet is byte-identical** — both builds emit `index-x7dbf3ph.css` at 604 180 bytes,
the same content hash, so no rule-by-rule diff was needed.

**The bundle grew.** 1 870 769 → 1 903 470 bytes, **+32 701 bytes (+1.7 %)**, all of it in the
JavaScript: React 19.3.0, Zod 4.6.5 and react-i18next 17.0.14 are bigger than what they replaced. That
is the price of being current and it is recorded rather than hidden.

**All four agent image targets rebuilt** on linux/arm64 and reported their new versions from inside the
image: `opencode --version` 1.18.31, `gemini --version` 0.59.0, `codex-acp --version` 1.11.0 with
`codex --version` still codex-cli 0.153.4, `claude --version` 2.1.272, and `@playwright/mcp` 0.0.81
with `chrome-devtools-mcp` 1.9.0 in `/opt/ho/mcp`. `npm audit` reports no known vulnerabilities in any
of the four locked trees.

The Claude Code APK went from 2.1.263-r1 to **2.1.272-r1**, which was not one of the four npm pins in
the plan the owner approved; it is the same class of outdated pin and is called out here so it can be
reverted on its own. Its build prints `[rtk] /!\ No hook installed` — that line is **not** new: the old
pin prints it too, and the resulting `/home/agent/.claude/settings.json` is byte-identical between the
two (sha256 `6cb751fc…`), carrying the `PreToolUse` Bash hook that calls `rtk hook claude`.
