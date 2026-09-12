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

## Added 2026-09-10

| #   | Where                              | Suppression                                                       | Assessment                                                                                                                                                        |
| --- | ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | `packages/ui/src/i18n/index.ts:47` | `oxlint-disable-next-line typescript/consistent-type-definitions` | i18next's typed keys are reached by augmenting its own `CustomTypeOptions` **interface**; a `type` cannot merge into an interface, so the rule cannot be met here |

There are **no** `any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` or non-null assertions anywhere in
the tracked source. Verified:

```
$ git ls-files | grep -E '\.(ts|tsx)$' | xargs grep -nE ':\s*any\b|<any>|as any|any\[\]'      → 0 hits
$ git ls-files | grep -E '\.(ts|tsx)$' | xargs grep -n '@ts-ignore\|@ts-expect-error\|@ts-nocheck' → 0 hits
$ git ls-files | grep -E '\.(ts|tsx)$' | xargs grep -nE '\w!\.|\w!\[|\w!\)|\w!;|\w!,' | grep -v '!=='  → 0 hits
```

## After Wave 1

The six inherited suppressions are now **five**, and their character changed:

| #   | Where                                                                  | Suppression                                                                   | Status                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/core/src/commands/shared.ts` (moved from `projects.ts:140`)  | `oxlint-disable-next-line typescript/no-unsafe-type-assertion`                | **now meaningful.** The rule it names was not enabled at baseline, so the comment suppressed nothing. Wave 1 enabled `typescript/no-unsafe-type-assertion`, so this is the one assertion in the tree and it is now genuinely justified: `Object.fromEntries` cannot express the mapped return type. |
| 2   | `packages/store/src/event-store.ts:77`                                 | `oxlint-disable-next-line typescript/require-await`                           | unchanged; `bun:sqlite` is synchronous while the port is async for remote backends. To be reviewed in Wave 3.                                                                                                                                                                                       |
| 3-6 | `packages/ui/src/office/{architecture,plan-view,stand-ins,walls}.ts:1` | `/* eslint-disable unicorn/no-array-fill-with-reference-type */` (whole file) | **removed.** Replaced by one `overrides` entry in `.oxlintrc.json` scoped to `packages/ui/src/office/*.ts`, so the rule is off for exactly those files and still active everywhere else (A1.1).                                                                                                     |

### Added by Wave 1

| Where                           | Suppression                                                                        | Reason                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.oxlintrc.json` `overrides[0]` | `unicorn/no-array-fill-with-reference-type: off` for `packages/ui/src/office/*.ts` | The rule misfires on PixiJS's `Graphics.fill(style)` purely because of the method name. Narrower than the four whole-file comments it replaces.                                                                                                                                                                      |
| `.oxlintrc.json` `overrides[1]` | `unicorn/filename-case: off` for `packages/store/drizzle/**`                       | That folder is generated by `drizzle-kit generate` and its file names are Drizzle's (`0000_boring_clint_barton.sql`). The sidecar type declaration must match the SQL file name exactly for TypeScript to resolve the text import, so renaming to kebab-case would break the build.                                  |
| `.oxlintrc.json` `rules`        | `typescript/explicit-function-return-type: ["error", {allowExpressions: true}]`    | Not a suppression of a finding but a deliberate narrowing: bare, the rule demanded `: void` on 30 contextually-typed inline callbacks. With `allowExpressions` it flags 5, all exported functions with inferred return types — which Wave 1 annotated. See the correction under A1.3.                                |
| `.oxlintrc.json` `rules`        | `node/no-process-env`, `node/no-sync`, `node/no-top-level-await`: `off`            | Enabling the `node` plugin (A1.2) brings these three. All three describe deliberate choices here: `Bun.env`/`process.env` is how configuration arrives, `existsSync` is used in resource resolution where async would infect a synchronous path, and top-level `await` is the module format this repository targets. |

No `any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` or non-null assertion was added.

## After Wave 2

The count is unchanged at five, and one of them moved:

| #   | Where                                  | Suppression                                                          | Status                                                                                                                                                                                                                 |
| --- | -------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/protocol/src/patch.ts`       | `oxlint-disable-next-line typescript/no-unsafe-type-assertion`       | **moved** from `core/src/commands/projects.ts` with the function it guards. `compact` builds its result with `Object.fromEntries`, whose type TypeScript cannot express; nothing else in the tree asserts.             |
| 2   | `packages/store/src/event-store.ts:77` | `oxlint-disable-next-line typescript/require-await`                  | unchanged; `bun:sqlite` is synchronous while the port is async for remote backends. Wave 3 reviews it.                                                                                                                 |
| 3-4 | `.oxlintrc.json` `overrides`           | the two scoped rule disables from Wave 1                             | unchanged.                                                                                                                                                                                                             |
| 5   | `.oxlintrc.json` `rules`               | `node/no-process-env`, `node/no-sync`, `node/no-top-level-await` off | unchanged, and `packages/daemon/src/version.ts` is a new deliberate `Bun.env` read: the version must come from the environment, and `@ho/protocol`/`@ho/core` compile with `types: []` precisely so they cannot do it. |

Nothing was added: no `any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, non-null assertion or
whole-file disable appears anywhere in the tree (grep in `VERIFICATION.md` § "No escapes anywhere").
