# Every comment removed from the source

The owner's task, 2026-09-16: remove all comments from the source code across the monorepo.

`1232` comments spanning `2097` lines left `267` TypeScript files, and `81` lines left the two
stylesheets. The diff is a pure deletion — no line was added, rewritten or moved.

## What stayed, and why it is not a comment

| Kept                                 | Count | Why                                                                  |
| ------------------------------------ | ----- | -------------------------------------------------------------------- |
| `oxlint-disable-next-line …`         | 7     | An instruction the linter reads. Deleting them fails `bun run lint`. |
| `#!/usr/bin/env bun`                 | 2     | A shebang is read by the kernel, not by a person.                    |
| `# …` in `ci.yml`, `rtk-config.toml` | 5     | Configuration, not source. Left deliberately — see the last section. |

Their reasons live in [audit/SUPPRESSIONS.md](../../audit/SUPPRESSIONS.md), which is where a suppression
is supposed to be explained anyway.

## Verified by proof, not by reading the diff

A comment stripper that is merely careful is not good enough at this scale: a `//` inside a regex
literal, a `/*` inside a string, or JSX text that happens to start with `//` all look like comments to a
regex. So the transformation is parser-driven and each file carries two independent proofs.

1. **Identical token stream.** Every file is parsed before and after, and the full leaf-token sequence —
   kind and exact text, JSDoc nodes excluded — must match. This covers type annotations, which the
   second proof cannot see.
2. **Identical transpiled output.** `Bun.Transpiler` drops comments and preserves everything else, so
   byte-equal output before and after means nothing but comments moved.

```
$ APPLY=1 bun run strip.ts $(git ls-files "*.ts" "*.tsx" "*.mjs")
rewrote 267 files, 1232 comments
OK every rewritten file: identical token stream and identical transpiled output

$ APPLY=1 bun run finalize.ts $(git diff --name-only)
checked 269 files against HEAD; empty-block fixes: 6
OK all files vs HEAD: identical token stream, identical transpiled output, identical css declarations
```

The stylesheets get a third proof, because Tailwind's scanner reads CSS as content and a class named
only in a comment does reach the build. The whole UI was built from `main` and from this branch:

```
$ diff -r ui-before ui-after
(no output)
```

Every built file is byte-identical, content hashes included — `index-vrgda16y.js`, `index-j2vw3mgd.css`,
`fonts-qeui7wtf.css`, `index.html` and all eleven font subsets. `backdrop-blur` is still in the
stylesheet, which is what the deleted comment in `app.css` claimed would happen.

`bun run check` passes: six programs typecheck, `oxlint --deny-warnings` is clean, `oxfmt --check` is
clean, the architecture gate holds, and the schema and skills checks pass. knip's one configuration hint
(`codesign`) was measured on `main` as well and is pre-existing.

### The one thing that needed fixing

Six empty blocks were left as `{\n}` where a comment had been the whole body, which
`unicorn/empty-brace-spaces` rejects. They are now `{}`. The token-stream proof covers the collapse: had
it touched a template literal, the token text would have changed.

## What this revealed

Removing the comments exposed knowledge that existed nowhere else.

The comment in `app.css` explaining why the `@source not` exclusion must never come back was the only
surviving record of it — [audit/SUPPRESSIONS.md](../../audit/SUPPRESSIONS.md) still listed entry 11 as
present, a day after it was taken out. That reasoning is now written in the ledger, and the ledger's
verified `grep` block, which listed three suppressions and stale line numbers, was re-run and corrected
to the seven that exist. `docs/CONVENTIONS.md` carried the same stale three.

This is the honest cost of the task: a comment that documents a trap is the kind that disappears
quietly. Anything load-bearing that was deleted is in `git show 4b5e343` and in the plans under
`docs/plans`.

## Not done

`.github/workflows/ci.yml` keeps four comment lines and `images/agent/rtk-config.toml` one. These are
configuration rather than source, and the CI ones record constraints that are not visible in the YAML —
that the agent Dockerfile requires arm64, and how much disk the runner has. Say the word and they go too.

`release.yml` looked like it had a comment at line 76; `## Home Office for macOS (Apple Silicon)` is
markdown inside the release-notes string, and removing it would have changed what every release says.
