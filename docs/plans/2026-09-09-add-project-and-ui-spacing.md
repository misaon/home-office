# Plan — the add-project dialog and an airier UI

Owner task, 2026-09-09. One pull request. Three owner decisions were taken before any code was
written; each option is recorded with the reason it was rejected.

## What the owner asked for

1. The "Repository path or URL" field of the add-project dialog gets an icon that opens the **native
   system file browser** so a directory can be picked instead of typed.
2. Git repositories get their **own input**, separate from the local path.
3. **Default branch** stops being a text input and becomes a **select of the repository's real
   branches**.
4. The UI overall is **airier** — the dialog in particular reads as one dense block today.

## Owner decisions

| Decision              | Chosen                                                               | Rejected                                                                                                                  |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Directory picker      | Native dialog in the desktop app, `osascript` fallback in the daemon | Electrobun only (the browser test loop could not use it); `osascript` only (the panel would not belong to the app window) |
| Local path vs git URL | Segmented source switch, one active input at a time                  | Two always-visible inputs (ambiguous when both are filled)                                                                |
| Scope of "airier"     | Whole UI plus larger typography                                      | Dialogs only; dialogs and panels without a typography change                                                              |

## Why the picker needs a daemon RPC

The office UI is one bundle served by the daemon over HTTP. It runs in two places: inside the
Electrobun window, and in a plain browser (`ho ui`, the test loop). Only the first has Electrobun's
`Utils.openFileDialog`, and the UI must not depend on the desktop shell. The daemon, however, always
runs on the machine whose directories are being picked — remote operation is still future work
([PLAN.md](../PLAN.md)) — so the dialog belongs behind an RPC with a host-side port:

```
UI  ──system.pickDirectory──▶  daemon  ──▶  DirectoryPicker port
                                             ├─ desktop app: Utils.openFileDialog (NSOpenPanel, owned by the window)
                                             └─ default: osascript `choose folder` (macOS), else "unavailable"
```

The desktop app runs the daemon in its own Bun process, so it injects the native implementation
through `startDaemon`. A daemon started separately (`ho daemon` in a terminal, which the desktop app
then attaches to) keeps the `osascript` fallback, which is what the browser test loop uses.

Injection safety: the prompt and the starting directory are passed to `osascript` as `run argv`
arguments, never interpolated into the script source. Cancelling reports AppleScript error `-128`
and becomes `status: "cancelled"`, not a failure.

## Branches

`projects.inspect` already runs git to learn a repository's name and default branch; it now returns its
branches in the same call, and the dialog's select is filled from that.

- Local checkout: `git for-each-ref --format=%(refname:short) refs/heads refs/remotes/origin`,
  `origin/` stripped, `HEAD` dropped, deduplicated, capped.
- Remote URL: one `git ls-remote --symref <url> HEAD 'refs/heads/*'` returns the symbolic HEAD and
  every head, replacing today's HEAD-only probe.

Verified on this repository 2026-09-09; both commands and their output are in
[audit/VERIFICATION.md](../../audit/VERIFICATION.md).

## Airier UI

Today `html` is `13px` and Tailwind's `text-xs` is `0.75rem`, so the most common class in the UI
renders at **9.75px**, and `p-2` at 7px. That is the actual cause of the density, not the amount of
markup. The fix is to make the scale absolute and larger:

- `@theme` sets `--spacing: 4px` and an explicit px text ramp — `--text-2xs` 11px, `--text-xs` 12px,
  `--text-sm` 13px, `--text-base` 15px, `--text-lg` 17px — each with its own `--text-*--line-height`.
  Tailwind v4's theme namespaces `--text-*`, `--text-*--line-height` and `--spacing` are confirmed from
  [the Tailwind theme documentation](https://tailwindcss.com/docs/theme), read 2026-09-09.
- `html` goes to 14px for anything unstyled, but nothing else depends on it any more: every existing
  `text-xs` renders at 12px instead of 9.75px and every `p-2` at 8px instead of 7px without touching a
  single component, and the 30 hardcoded `text-[10px]`/`text-[11px]` become `text-2xs`/`text-xs`.
- Shared primitives (`Field`, `Section`, `Button`, `Segmented`, `Modal`, one `CONTROL` class for every
  field) carry the new rhythm: taller inputs, real gaps between groups, section headers with a rule.
  Panels, the settings sections, the setup checklist and the header adopt them; the right-hand panel
  widens from 400 to 440 px to keep the same content per line.
- The Pixi canvas is untouched — sprite scale and the plan view are independent of CSS.

## Work

1. `@ho/protocol` — `RepoInspection.branches`, `DirectoryPickInput`/`DirectoryPick`,
   `system.pickDirectory` on the contract.
2. `@ho/daemon` — `host-dialog.ts` (the port and the `osascript` adapter), the RPC context and router,
   `DaemonOptions.pickDirectory`, branches in `repo-inspect.ts`.
3. `@ho/desktop` — the native `Utils.openFileDialog` adapter passed into `startDaemon`.
4. `@ho/ui` — theme tokens, the shared kit, the rewritten add-project dialog, and the spacing pass over
   panels, settings, the setup overlay and the header.
5. Documentation — the new RPC and port in [ARCHITECTURE.md](../ARCHITECTURE.md), the measured commands
   in [audit/VERIFICATION.md](../../audit/VERIFICATION.md), this plan and the audit log line in
   [PLAN.md](../PLAN.md).

## Verification

`bun run check` (16 compiler targets, type-aware oxlint, oxfmt, knip, the UI build) plus the office
driven in a real browser against a live daemon: the empty-office button, the dialog with a local
directory and with a git URL, the branch select filled from git, and the picker RPC answering. The
native panel path is exercised in the packaged desktop app.
