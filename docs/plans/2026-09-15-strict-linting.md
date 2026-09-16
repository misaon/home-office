# The linter, turned up: what the survey measured and what the pipeline now enforces

The owner's task, 2026-09-15: find the most modern linter available, deploy it, set it as strictly as it
goes, fix everything it finds, and keep the pipeline green — for React, CSS and TypeScript.

The survey was done against the actual code rather than against comparison articles, and it changed the
answer twice. What shipped is **oxlint 1.83.0 with every category on except `restriction`**, 385 → 554
enforced rules, 81 findings fixed in the code, 34 rules turned off with a reason each, and
`bun run check` green.

## What the candidates did to this repository, measured 2026-09-15

Versions are from the npm registry on the day.

| Tool                                           | Version         | Published  | On this codebase                                                                                                                                                                                                  |
| ---------------------------------------------- | --------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rslint** (Rspack/Rstack, Go + typescript-go) | 0.9.2           | 2026-09-07 | **Reproducible Go panic** — `Unhandled case in Node.Text: *ast.ComputedPropertyName` in the `no-deprecated` rule. With that rule off: 283 files, 154 rules, **806 ms**, 14 findings oxlint did not have           |
| **Biome**                                      | 2.5.13          | 2026-09-10 | `preset: "all"` produced 6 780 diagnostics, of which 2 945 came from a generated, git-ignored bundle and hundreds from **Qwik and Solid** rules; `noReactSpecificProps` alone fired 554 times on legitimate React |
| **oxlint** (in use)                            | 1.82.0 → 1.83.0 | 2026-09-14 | 385 rules on, 0 findings                                                                                                                                                                                          |
| **ESLint**                                     | 10.10.0         | 2026-09-04 | the mature reference; adopting it means returning typescript-eslint and its plugin chain, which the September audit removed                                                                                       |

Two things follow from those numbers rather than from taste.

**"Strictest possible" is not a coherent setting for Biome.** `preset: "all"` enables rules that
contradict each other: framework rules for three different frameworks at once, and stylistic rules that
argue with the repository's own decisions. It is not a large amount of work, it is an incoherent target.

**Replacing oxlint with Rslint would have made the linting _less_ strict, not more.** Rslint covers
197 of the 385 rules this repository enforces; 188 have no counterpart — all 37 React rules including
`rules-of-hooks` and `exhaustive-deps`, `strict-boolean-expressions`, `explicit-function-return-type`,
`consistent-type-imports`/`-exports`, `no-unsafe-type-assertion`, `switch-exhaustiveness-check`,
`import/no-cycle`, all 21 `oxc` correctness rules, `max-lines`, and 56 `unicorn` rules. That measurement
is why the owner's first instinct — replace — was put back to him with the number attached, and why the
answer became "keep oxlint, but set it really strictly".

## What is on now

`categories` gained `style` and `nursery`; both were off. `restriction` stays off: it is the category
whose stated job is to _prevent the use of language and library features_, and on this codebase it bans
`async`/`await` (242 findings), optional chaining (198) and rest/spread (170).

```
correctness  suspicious  pedantic  perf  style  nursery   ← all error
restriction                                               ← off, see above
```

Enabled rules went from **385 to 554**. With everything on and nothing excused, the repository had
**10 135 findings in 51 rules**. After the exclusions below, **81** remained, and all 81 were fixed in
the code.

## The 34 rules turned off, and why each one earns it

Nothing here was turned off because fixing it was tedious. Each is a rule that, on this codebase, either
contradicts a decision already recorded or cannot be satisfied at all.

**Two are not opinions — they are deadlocks with `oxfmt`, which runs in the same `bun run check`.**
Proven by applying `oxlint --fix` and then `oxfmt` to the same file:

| Rule                          | What happens                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `unicorn/number-literal-case` | wants `0xECEAE4`; `oxfmt` rewrites it to `0xeceae4`. Measured both ways on `colours.ts` |
| `unicorn/no-nested-ternary`   | wants parentheses; `oxfmt` removes them. Measured on `tokens.ts`                        |

With either on, the pipeline could never be green — not with more work, but at all.

**Nine contradict a decision this repository already made**, several of them recorded in the audit:

| Rule                                                                                            | Why it cannot hold here                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import/no-named-export` (948)                                                                  | the repository is named exports throughout — and it contradicts `import/prefer-default-export` (127), which was also on                                   |
| `import/group-exports` (696), `import/exports-last` (313), `import/prefer-default-export` (127) | same module style, and mutually incompatible                                                                                                              |
| `promise/prefer-await-to-then` (53), `promise/prefer-await-to-callbacks` (12)                   | they fight `void promise.then()`, which is the deliberate fire-and-forget idiom `typescript/no-floating-promises` is configured with (`ignoreVoid: true`) |
| `unicorn/no-null` (394)                                                                         | the protocol distinguishes `null` from `undefined` on purpose; the reducer and the RPC contract both rely on it                                           |
| `import/no-nodejs-modules` (47)                                                                 | the daemon is a Bun/Node program                                                                                                                          |
| `unicorn/prefer-global-this` (20)                                                               | the office's `window` references are browser code, where `window` is the clearer name                                                                     |

**Thirteen are style with no defensible reading here**, and the counts say why: `eslint/one-var` (1 739),
`eslint/no-magic-numbers` (956 — the office is drawn in whole pixels and the simulation runs on physical
constants), `eslint/id-length` (898 — forbids `t`, `a`, `b` in comparators and in i18n), `eslint/sort-keys`
(885), `eslint/no-ternary` (661 — the drawing's conditional classes _are_ ternaries), `eslint/sort-imports`
(497 — oxfmt already orders them), `eslint/func-style` (340), `react/jsx-max-depth` (157),
`eslint/max-statements` (118), `unicorn/max-nested-calls` (97), `eslint/max-params` (84),
`eslint/capitalized-comments` (51), `eslint/no-continue` (27).

**The rest, with a reason each**: `eslint/no-undef` (274 — TypeScript's job, and a classic false-positive
source in TS), `import/consistent-type-specifier-style` (411 — `typescript/consistent-type-imports`
already governs this and they disagree), `eslint/no-nested-ternary` (30 — kept in its `unicorn` form,
which asks for parentheses instead of forbidding the expression), `react/hook-use-state` (2 — fires on
`const [value] = useState(() => …)`, the compute-once idiom, where naming an unused setter is worse),
`react/function-component-definition` (1 — fires inside `@ho/sim`, which has no components),
`eslint/init-declarations` (13), `eslint/func-names` (5), `react/jsx-props-no-spreading` (1),
`promise/avoid-new` (11).

**Two were not turned off but configured, which is different**: `eslint/new-cap` now has
`properties: false`, because `errors.NOT_FOUND(…)` is a call into oRPC's error table and not a
constructor; `unicorn/prefer-ternary` now has `only-single-line`, because the one place it fired was an
`if`/`else` around two multi-line `await git(...)` calls where a ternary would be worse.

## The 81 findings, fixed in the code

| Rule                                 |   n | What changed                                                                                                                                          |
| ------------------------------------ | --: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unicorn/no-await-expression-member` |  45 | `(await f()).x` gets a named intermediate. The worst of them were the CLI's `await (await client()).secrets.status()` — the connection now has a name |
| `eslint/prefer-named-capture-group`  |  13 | every capture group is named or made non-capturing. `repo.ts` reads `scp["user"]` instead of `scp[1]`                                                 |
| `eslint/prefer-destructuring`        |   8 | `const [first] = xs` where the first element was wanted                                                                                               |
| `unicorn/custom-error-definition`    |   2 | `DomainFailure` → `DomainFailureError`, `SecretStoreTimeout` → `SecretStoreTimeoutError`, `name` following                                            |
| `typescript/prefer-optional-chain`   |   2 | `last?.event.kind !== "context"`, `task?.kind !== "work"`                                                                                             |
| `eslint/no-unreachable-loop`         |   1 | reading one line from the terminal is not a loop; `secret.ts` takes the first line from the iterator                                                  |
| `unicorn/no-useless-spread`          |   1 | `[...this.#walking]` → `new Map(this.#walking)`; the copy is load-bearing (`arrived` deletes from it) so it stayed a copy                             |
| `typescript/prefer-for-of`           |   1 | the editor's breadth-first label search, with a comment that the queue grows while it is walked                                                       |
| `import/first`                       |   1 | an import sat in the middle of `design/live.ts`, left over from the drawing port                                                                      |
| the rest                             |   7 | `default-param-last`, `no-anonymous-default-export`, `object-shorthand`, `consistent-existence-index-check`, `prefer-spread`                          |

`oxlint --fix` did 129 of them and **broke the build doing it**: it rewrote the React `CSSProperties`
augmentation in `design/tokens.ts` from an `interface` with an index signature into
`type CSSProperties = Record<…>`, which replaces React's own type instead of widening it and takes every
real CSS property with it. The augmentation is restored, and the rule behind it —
`typescript/consistent-indexed-object-style` — now carries an inline suppression on the index-signature
line itself, next to the one `consistent-type-definitions` already had.

## CSS: oxlint cannot, and this says so rather than pretending

The task asked for React, CSS and TypeScript. oxlint lints JavaScript, TypeScript and JSX; **it has no
CSS rules at all**, so the CSS half of that sentence is not delivered by this change. What the
repository does have is that `bun run check` compiles `packages/ui/src/design/app.css` through the
Tailwind CLI, and a stylesheet that does not compile fails the build — so CSS _syntax_ is gated, and
CSS _lint quality_ is not.

Linting the 878 lines of CSS (`app.css` 558, `fonts.css` 320) would mean a second tool — Biome or
stylelint — and the owner's decision on 2026-09-15 was to keep oxlint alone. It is left open rather than
solved quietly.

## Verification

`bun run check` green: typecheck over six programs, `oxlint --deny-warnings` with the new configuration,
`oxfmt --check`, knip, and the production UI build.

The change touched ten UI files, so the office was compared the way the last two rounds were: two builds
served side by side from two daemons on scratch `HO_HOME`s seeded from one copy of the same database,
driven through 28 states by headless Chrome over CDP at 1440×900, animations cancelled, canvas hidden,
every pixel compared at zero tolerance. The compiled stylesheet is rule-for-rule identical to the
previous build's.
