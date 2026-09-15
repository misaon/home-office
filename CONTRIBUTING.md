# Contributing to Home Office

Thank you for taking the time. This document is what a first contribution needs and nothing more.

## Before you start

Open an issue before a large change. Home Office has strong opinions about its architecture — a pure
event-sourced core, adapters behind ports, and a drawing that is verified by image — and a pull request
that cuts across them is easier to discuss before it is written than after. Small fixes need no issue.

## Getting it running

```sh
bun install --frozen-lockfile
bun run devkit
bun run desktop:dev
```

You need [Bun](https://bun.com) 1.4.2 or newer, Docker Desktop, and macOS on Apple Silicon for the
desktop app. The daemon and the CLI run anywhere Bun does.

## The one gate

```sh
bun run check
```

That is the whole contract: a typecheck over six programs, `oxlint --deny-warnings`, `oxfmt --check`,
knip, and a production build of the office UI. It must pass before every commit — `bun run setup`
installs the git hook that enforces it, and CI runs it again on every pull request along with the agent
image builds.

`bun run fmt` fixes formatting. Do not add lint suppressions to get past a rule; if a rule is wrong for
this codebase, say so in the pull request and we will turn it off in `.oxlintrc.json` with the reason
written down, the way the other 34 are.

## What the code expects of you

- **`packages/core` and `packages/sim` are pure.** No I/O, no Bun or DOM globals. Side effects live in
  adapter packages behind the interfaces core defines.
- **Every boundary is validated with Zod**, and agent output never becomes a shell command.
- **Secrets never appear** in images, container configuration, labels, logs or events.
- **A number in documentation is a claim.** Measure it or leave it out. `audit/VERIFICATION.md` is the
  format: the command and its real output.
- **Verify external facts** — CLI flags, APIs, versions — against the source, and write the source and
  the date next to the claim.
- **Tests and code comments are the maintainer's call.** The September 2026 audit ran under "no tests,
  no code comments"; do not add either without asking first.
- **Dependencies are recorded in `docs/STACK.md`** with the decision behind them. A pull request that
  adds one without that record will be asked for it.

## Commits and pull requests

Conventional Commits: `fix(ui): …`, `feat(daemon): …`, `docs: …`. Say what changed and why; if you
measured something, put the number in the message.

One pull request per concern. Fill in the template — particularly how you verified the change, because
this project does not take "it should work" for an answer.

## Changes you can see

The office is drawn, so a change to `packages/ui` is verified by looking at it. Say in the pull request
what you looked at and how. If a change is meant to be invisible, say that too, and how you established
it.

## Reporting a security problem

Do not open an issue. See [SECURITY.md](SECURITY.md).
