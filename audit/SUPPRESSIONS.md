# Suppressions

Every lint or type suppression that survives in the tree, with the reason it is justified. A suppression
that is only masking a rule we do not want is not listed here — the rule gets fixed or removed instead.

## Inherited from the baseline (commit `ecd4aa5`)

| #   | Where                                        | Suppression                                                                   | Assessment                        |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| 1   | `packages/core/src/commands/projects.ts:140` | `oxlint-disable-next-line typescript/no-unsafe-type-assertion`                | Reviewed in Wave 2/3 — see AUDIT. |
| 2   | `packages/store/src/event-store.ts:77`       | `oxlint-disable-next-line typescript/require-await`                           | Reviewed in Wave 3 — see AUDIT.   |
| 3   | `packages/ui/src/office/architecture.ts:1`   | `/* eslint-disable unicorn/no-array-fill-with-reference-type */` (whole file) | Reviewed in Wave 2 — see AUDIT.   |
| 4   | `packages/ui/src/office/plan-view.ts:1`      | same, whole file                                                              | Reviewed in Wave 2 — see AUDIT.   |
| 5   | `packages/ui/src/office/stand-ins.ts:1`      | same, whole file                                                              | Reviewed in Wave 2 — see AUDIT.   |
| 6   | `packages/ui/src/office/walls.ts:1`          | same, whole file                                                              | Reviewed in Wave 2 — see AUDIT.   |

There are **no** `any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` or non-null assertions anywhere in
the tracked source. Verified:

```
$ git ls-files | grep -E '\.(ts|tsx)$' | xargs grep -nE ':\s*any\b|<any>|as any|any\[\]'      → 0 hits
$ git ls-files | grep -E '\.(ts|tsx)$' | xargs grep -n '@ts-ignore\|@ts-expect-error\|@ts-nocheck' → 0 hits
$ git ls-files | grep -E '\.(ts|tsx)$' | xargs grep -nE '\w!\.|\w!\[|\w!\)|\w!;|\w!,' | grep -v '!=='  → 0 hits
```

## Added by this audit

_(none yet)_
