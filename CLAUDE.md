@AGENTS.md

## Claude Code

Everything above applies. What follows is only what differs for you.

- **Plan before a contract change.** Editing `packages/protocol` ripples into the daemon, the CLI and
  the UI in the same commit. Agree the shape first, then change all four.
- **Run `bun run check` yourself before committing.** It takes minutes — six tsc programs plus the UI
  build — so start it and wait for it. The pre-commit hook runs the same thing, and a red check
  becomes a blocked commit.
- **Read narrowly.** `packages/ui/dist/` holds a bundle of tens of megabytes; never read or search it,
  nor `.hutch/`, `.tools/`, `.tscache/`, `build/`, `bun.lock`. Prefer `rg` and targeted reads over
  whole files.
- **Do not create files the task did not ask for** — no README, no `docs/`, no plan or summary
  markdown, no scratch scripts inside the repository. Temporary things belong in the scratchpad
  directory.
- **The product uses this repository too.** Branches named `ho/task-*`, the SQLite log under
  `$HO_HOME` and `.ho/config.json` belong to Home Office at runtime. Leave them alone unless the task
  is about them.
- **A subagent inherits none of this.** When you delegate, restate the invariant it needs: purity of
  `core` and `sim`, events as the only way to change state, no tests and no comments.
- **English in the repository:** code, identifiers, commit messages and any committed prose.
