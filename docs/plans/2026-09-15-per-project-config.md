# Per-project configuration in the repository (`.ho/`)

Owner request, 2026-09-15: a floor's configuration should live in the project's own repository — a `.ho`
directory at the root holding JSON — instead of only in the installation. Tokens and keys stay on the
machine.

## Where configuration lives today

| What                                                                                | Where                                                |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Host: bind address, port, Docker socket/network/images, cgroup limits, secret store | `~/.config/home-office/config.json` (`DaemonConfig`) |
| Floors, agents, tasks, sessions                                                     | the event log `ho.db`, per installation              |
| Provider credentials                                                                | OS credential store, or a 0600 file                  |

So the repository knows nothing about its own floor. Clone it on another machine and you get an empty
office: the boss, the staff, their personas, budgets and policies all live in one SQLite file that never
leaves the host that created it.

## Three layers, not two

The trap is treating this as "global vs local". It is three things, and only the middle one belongs in the
repository.

1. **Machine** — port, Docker socket, image tags, cgroup limits, secret store kind. Differs per host.
   Stays in `DaemonConfig`. Unchanged by this plan.
2. **Floor intent** — who sits on the floor (role, provider, model, effort, skill pack, base prompt),
   publish/intake/services policy, default branch, budgets. This is "what this repository wants", it is
   reviewable in a pull request, and it is what makes a floor reproducible. **This moves into `.ho/`.**
3. **Secrets** — never in the repository.

Layer 3 costs nothing here, which is worth stating precisely: `secretKeysFor(provider, auth, model)` in
`packages/protocol/src/providers.ts` already derives the secret-store key from the provider, the auth kind
and the model prefix. An agent record has never held a key or a key name, only `provider` and `auth`. The
file therefore carries neither a value nor a reference — `{"provider": "claude-code", "auth": "subscription"}`
is enough for the daemon to look up `anthropic-oauth-token` in the credential store at session start. No new
mechanism is needed to keep secrets out.

## Owner decisions, 2026-09-15

Three questions were put to the owner with the risks stated. The answers:

- **Authority: the file wins, with no approval step.** What `.ho/config.json` says is applied. The
  alternative offered — apply only from the default branch, clamp against the host, and require an explicit
  approval on every change of the file's fingerprint — was declined.
- **Scope: the whole floor.** Agents, policies, budgets and default branch.
- **Agents may edit `.ho/` freely.** No restriction on what an agent session writes into that directory.

### Accepted risk

This combination is recorded here because it was chosen knowingly, not overlooked.

`home-office` is a public repository. The per-project fields the file will carry include
`services.mode: "rootful"`, which `docs/ARCHITECTURE.md` describes as the widest boundary the application
opens (a successful escape is root inside the Docker VM); `budgets`, which spends the owner's money; and
`basePrompt`, four thousand characters injected into every agent on the floor. A pull request that edits
`.ho/config.json` therefore proposes a privilege change, and because agent sessions may write to `.ho/`,
an agent can propose a raise to its own budget or a rewrite of its own prompt in its own branch.

Two properties of the design below limit the blast radius without adding the approval step the owner
declined, and both are consequences of decisions made for other reasons:

- The file is read from the **default branch** (or, for a local checkout, the working tree) — never from a
  task or pull-request branch. The reason is determinism: a task must not be able to change its own budget
  halfway through its own run. The security effect is a side benefit, and it means an agent's edit takes
  effect only once a human merges it.
- Every apply is recorded as events with `actor: system`, and `ho project sync --dry-run` prints the diff,
  so a change is visible after the fact even though nothing blocks it.

The one existing host clamp stays as it is: `DaemonConfig.services.enabled = false` disables the private
container engine for every project regardless of project policy. That behaviour predates this plan and is
documented; removing it was not requested.

## The file

`.ho/config.json` at the repository root, with an optional `.ho/config.local.json` beside it for values
specific to one machine. The local file is gitignored and layered over the committed one — the same
arrangement Claude Code uses for `.claude/settings.json` and `.claude/settings.local.json`
([Claude Code settings docs](https://code.claude.com/docs/en/settings), read 2026-09-15).

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/misaon/home-office/main/schema/office.schema.json",
  "version": 1,
  "name": "Home Office",
  "defaultBranch": "main",
  "publish": { "mode": "pull-request", "draft": true },
  "intake": { "enabled": false, "labels": ["home-office"], "comment": true },
  "services": { "enabled": false, "mode": "rootless" },
  "budgets": { "maxTurnsPerTask": 60, "maxConcurrentSessions": 1, "maxWallMinutes": 60 },
  "agents": [
    {
      "name": "Andrew",
      "role": "boss",
      "gender": "male",
      "provider": "claude-code",
      "auth": "subscription",
      "model": "claude-opus-5",
      "effort": "high",
      "skillPack": "boss",
      "basePrompt": "You run this floor. …",
    },
  ],
}
```

Not in the file: `repo` (the file is inside the repository it would describe), ids, timestamps, and
anything derived from the event log. `budgets` at the top level is the floor's default; an agent may carry
its own to override it.

The `$schema` file is generated from the Zod schema with
`z.toJSONSchema(OfficeFile, { target: "draft-2020-12" })`, native to Zod 4
([zod.dev/json-schema](https://zod.dev/json-schema), read 2026-09-15) — no new dependency.

## How it is applied

The file is an **input that produces events**, not a second store. `ho.db` stays the single source of
truth, which keeps the event-sourced architecture intact and avoids two states to reconcile.

Applying is a pure function in `packages/core` (no I/O, per the pure-core rule) that takes the read model,
the parsed file and the project id, and returns events:

- `project.updated` when name, default branch or any policy differs.
- `agent.created` for a name in the file with no agent on the floor.
- `agent.updated` for a name present in both whose fields differ.
- `agent.removed` for an agent on the floor and not in the file — **only when it has no active session**;
  otherwise it is left alone and named in the report.

Agents are matched by **name, case-insensitively**, which is already the floor's uniqueness rule
(`packages/core/src/commands/agents.ts`). A floor's boss is guaranteed by `createProject`; a file with no
boss leaves the existing one in place rather than deleting it.

Conflicts that cannot be resolved are reported, not forced: a `name` already used by another floor, an
unknown provider or skill pack, a model the provider catalogue does not list.

### When it runs

- On `project.create`, instead of only seeding the default Andrew.
- On daemon start, for every project whose repository is reachable.
- On `ho project sync [--dry-run]` and the equivalent button in the UI.
- For a `local` repository, a debounced watch on `.ho/` so editing the file applies it (phase 6, optional).

### Which revision is read

| Repository kind | Read from                                              |
| --------------- | ------------------------------------------------------ |
| `local`         | the working tree at the checkout path                  |
| `git`           | the default branch of the daemon's mirror, after fetch |

A local checkout parked on a feature branch therefore applies that branch's file. That follows from reading
the working tree, which is what makes editing the file feel immediate; it is noted so it is not a surprise.

## Export

The reverse direction matters as much as the forward one: nobody should have to hand-write this JSON.

- A pure `officeFileFrom(project, agents)` in `packages/core`.
- `ho project export` writes `.ho/config.json` into the repository.
- A button in the floor's settings in the UI.

Acceptance: export → apply → export is byte-identical, and apply of an exported file produces no events.

## Phases

| #   | Work                                                                                 | Where it landed                                                                                          |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | `OfficeFile` Zod schema, `schema/office.schema.json` generated from it               | `packages/protocol/src/office-file.ts`, `scripts/office-schema.ts`; `bun run schema:check` is in `check` |
| 2   | Resolve and parse both repository kinds, layer `.ho/config.local.json`               | `packages/daemon/src/office-config.ts`                                                                   |
| 3   | `applyOfficeFile` — pure, returns events, reports what it could not do               | `packages/core/src/office-file{,-apply,-roster}.ts`                                                      |
| 4   | Wiring: project create, daemon start, `ho project sync [--dry-run]`, RPC + UI button | `projects.sync`, `OfficeConfigSync`, `ho project sync`, `FloorConfigFile`                                |
| 5   | Export: `officeFileFrom`, `ho project export`, UI button                             | `officeFileFrom`, `projects.export`, `ho project export`                                                 |
| 6   | Debounced watch on `.ho/` for local repositories                                     | `packages/daemon/src/office-config-watch.ts`, one second                                                 |
| 7   | Docs, and this repository's own `.ho/config.json`                                    | `ARCHITECTURE.md`, `CONVENTIONS.md`, `STACK.md`, `README.md`, `.ho/config.json`                          |

### What was built differently from this plan

- **The boss is matched by role, not by name.** The plan matched every colleague by name and said a file
  with no boss leaves the existing one in place. Matching by name cannot express renaming the boss, and a
  floor is guaranteed exactly one, so the boss entry updates whoever holds the role — including their
  name — and no boss is ever created or removed. A file with no boss entry still leaves the boss alone.
- **`agents` absent and `agents: []` mean different things.** Absent leaves the staff as they are; an
  empty array asks for a floor with nobody but the boss. The plan did not distinguish them, and without
  the distinction a file that only sets a policy would fire everyone.
- **The machine-local overlay is read for local checkouts only.** A mirrored repository is bare and has
  no working tree to hold an untracked `.ho/config.local.json`.
- **Export needs a local checkout**, for the same reason: a bare mirror has nowhere visible to write.
- **Phase 6 was built, not skipped.** Without it the file is something you run a command about rather
  than something you edit.
- **This repository's own `.ho/config.json` states no `agents`.** It carries the floor's policies only,
  because a committed roster would release colleagues the owner has on that floor and this branch cannot
  know who they are. `ho project export` fills the roster in whenever the owner wants it committed.

### Verified, 2026-09-15

`applyOfficeFile` and `officeFileFrom` driven against an in-memory read model — a floor with Andrew and
one worker, Pam — with the output quoted as it was printed:

```
apply(export) events: 0
apply(export) changes: []
export round trip byte-identical: true
plan example parses: true
changes: [
 "intake: off → off [home-office]",
 "- Pam",
 "~ Andrew: model opus → claude-opus-5, effort medium → high, base prompt"
]
problems: []
roster now: Andrew/boss/claude-opus-5
second apply events: 0
```

An exported file applies back with no events, exporting twice is byte-identical, the example above in
this plan parses, applying it produces that diff, and applying it again is a no-op. The example's
`claude-opus-5` is accepted because Claude Code takes free-form model ids; the catalogue's own aliases
are `fable`/`opus`/`sonnet`/`haiku`.

No new dependency: Zod, simple-git and the existing RPC surface cover all of it, so `STACK.md` needs a
decision record rather than an addition.

### Verified end to end against a running daemon, 2026-09-15

A daemon on its own `HO_HOME`, a scratch git repository as a local floor. Quoted as it printed:

- `ho project export Demo` → `wrote …/.ho/config.json (1077 bytes)`; `ho project sync Demo` on that file →
  `nothing to change`. Export, apply, export again is byte-identical (`cmp`).
- Editing the file and running `ho project sync Demo --dry-run` printed
  `name: Demo → Demo Floor`, `publish: branch → pull-request`, `+ Pam (worker, claude-code/sonnet)`,
  `+ Dwight (reviewer, opencode/anthropic/claude-sonnet-5)` and appended nothing; the same command
  without `--dry-run` printed the same four lines and `ho agent list` then showed all three colleagues.
- `.ho/config.local.json` adding `services.enabled` and a model for Pam → source line reads
  `…/config.json + config.local.json`, diff `services: off → rootless`, `~ Pam: model sonnet → haiku`.
- A malformed overlay (`{"name": "X"}` as an agent) reported
  `Invalid option: expected one of "boss"|"worker"|"reviewer"|"clerk" → at agents[0].role` and changed
  nothing.
- Removing Dwight from the file and touching nothing else: the daemon logged
  `{"why":"watch","changes":["- Dwight"],"msg":"office file applied"}` within three seconds.
- Stopping the daemon, renaming the floor in the file, restarting: `{"why":"start","changes":["name:
Demo Floor → Restarted"]}` and `ho project list` showed `Restarted`.
- The mirror path was exercised directly rather than through a floor, because `RepoSource` takes only
  https/ssh URLs and this run had no network: `git show main:.ho/config.json` on a bare clone returned
  the committed file, and after committing `maxTurnsPerTask: 999` on a side branch and fetching, the
  mirror's `main` still read `60` — a branch's file is not what a mirrored floor applies.

Not exercised: a real `git`-kind floor end to end (it needs a reachable remote).

## Sources

- [Settings files and precedence — Claude Code docs](https://code.claude.com/docs/en/settings), read 2026-09-15
- [Workspace Trust — Visual Studio Code](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust), read 2026-09-15 (the declined approval model)
- [Securely using `pull_request_target` — GitHub docs](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target), read 2026-09-15
- [Actions `pull_request_target` and environment branch protections changes — GitHub changelog, 2025-11-07](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/), read 2026-09-15 (workflow source is now always the default branch)
- [JSON Schema — Zod](https://zod.dev/json-schema), read 2026-09-15
