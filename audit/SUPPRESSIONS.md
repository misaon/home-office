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

## Removed 2026-09-14

Entries 8 and 9 below, and the three scoped concessions shadcn/ui needed (fourteen lint rules off for
`packages/ui/src/components/ui/**`, `exactOptionalPropertyTypes: false` for the UI program, and knip's
ignore of that directory) are gone: the vendored components were replaced by the drawn design and
deleted, so nothing needs them. The UI program is as strict as every other program again.

## Added 2026-09-14

| #   | Where                                      | Suppression                                              | Assessment                                                                                                                                                                                                            |
| --- | ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | `packages/ui/src/design/board-card.tsx:75` | `oxlint-disable-next-line jsx-a11y/prefer-tag-over-role` | The task row carries its own delete button, and a `<button>` may not contain another button, so the row cannot be the tag the rule asks for. It is a `div` with `role="button"`, a label, `tabIndex` and Enter/Space. |
| 9   | `packages/ui/src/design/team-row.tsx:72`   | `oxlint-disable-next-line jsx-a11y/prefer-tag-over-role` | The colleague row is kept the same element as the board's rows for consistency; same role, label, `tabIndex` and keyboard handling.                                                                                   |

| 10 | `packages/ui/src/design/tokens.ts` | `oxlint-disable-next-line typescript/consistent-type-definitions` | The office sets CSS custom properties inline and reads them back from utilities such as `w-(--sheet)`. React's `CSSProperties` has no room for a name it does not know; widening it means merging into React's own **interface**, which a `type` cannot do — the same situation as #7. It replaces twelve `as React.CSSProperties` assertions. |

`knip.json` also gained one `ignoreDependencies` entry, `@tailwindcss/cli` for `packages/ui`: the UI build
spawns that binary (`scripts/ui-build.ts` resolves it through the package graph and runs it), and knip
only sees dependencies that are imported. The reference is real and would throw at build time if the
package were missing.

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

## Current state, 2026-09-13

The architecture pass changed the facts several rows above record, so this section supersedes them. Three
suppressions survive in the source, plus one scoped rule override:

| #   | Where                              | Suppression                                                                       | Why it is justified                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/protocol/src/patch.ts:5` | `typescript/no-unsafe-type-assertion`                                             | `compact()` builds its result with `Object.fromEntries`, whose return type TypeScript cannot express. Unchanged; `type-fest`, which ADR 005 adopted for this job, is gone.                                                                                                                                                                                                    |
| 2   | `packages/store/src/index.ts:156`  | `typescript/require-await`                                                        | `bun:sqlite` is synchronous while the `EventStore` port is async for remote backends. **Moved** from the deleted `packages/store/src/event-store.ts:77`.                                                                                                                                                                                                                      |
| 3   | `packages/ui/src/i18n/index.ts:50` | `typescript/consistent-type-definitions`                                          | i18next's typed keys are reached by augmenting its own `CustomTypeOptions` **interface**; a `type` cannot merge into an interface.                                                                                                                                                                                                                                            |
| 4   | `.oxlintrc.json` `overrides[0]`    | `unicorn/no-array-fill-with-reference-type` off for `packages/ui/src/office/*.ts` | Still earning it: the rule misfires on PixiJS's `Graphics.fill(style)` purely because of the method name (`tiles.ts:31` trips it with the override removed).                                                                                                                                                                                                                  |
| 5   | `.oxlintrc.json` `overrides[1]`    | `jsx-a11y/prefer-tag-over-role` off for `packages/ui/src/kit/select.tsx`          | Added 2026-09-13. The rule's advice for `role="listbox"` and `role="option"` is to use `<select>` and `<option>` — the element this component exists to replace, because the list a native select opens is an operating-system window that takes none of the office's styling. The roles are the correct ones for a composed select, and no other file in the tree uses them. |

The `packages/store/drizzle/**` override recorded under "Added by Wave 1" was **removed on 2026-09-13**
together with Drizzle itself: the store is one `bun:sqlite` module with no generated files.

Verified:

```
$ git ls-files "*.ts" "*.tsx" | xargs grep -n "oxlint-disable\|eslint-disable"
packages/protocol/src/patch.ts:5:  /* oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries cannot express the mapped type */
packages/store/src/index.ts:156:    // oxlint-disable-next-line typescript/require-await -- bun:sqlite is synchronous; the port is async for remote backends
packages/ui/src/i18n/index.ts:50:  // oxlint-disable-next-line typescript/consistent-type-definitions
```

No `any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, non-null assertion or whole-file disable exists
anywhere in the tracked source.
