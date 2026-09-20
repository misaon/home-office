---
name: modern-web-platform
description: "Load before you write or change JavaScript, TypeScript, CSS or HTML, and again when a reviewer asks whether the code uses the current form of the language. How to find out what the repository's toolchain and browser targets support, which syntax and platform features to reach for as of September 2026, what to verify online before using, and how to say so in the report."
---

# Writing for the current web platform

The office wants code in the newest form the project can run, never the form you learned first.
"Newest" is a fact about this repository, so establish it before you write.

## 1. Read the targets first

- `package.json`: `engines`, the framework versions (`react`, `vue`, `next`, `nuxt`, `svelte`,
  `astro`), the TypeScript version, the bundler (`vite`, `next`, `bun`, `webpack`, `esbuild`).
- `browserslist` (in `package.json` or `.browserslistrc`) or the framework's default targets:
  this decides which CSS and DOM features ship without a polyfill.
- `tsconfig.json`: `target`, `module`, `moduleResolution`, `lib`, `strict`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`, `noUncheckedIndexedAccess`. Write to these settings, do not fight them.
- The lint and format configuration and the repository's own rules file (AGENTS.md, CLAUDE.md):
  they outrank this skill.

Match the idiom of the file you are in. A module that uses one style consistently keeps it; raise
the change separately rather than mixing two styles.

## 2. Reach for these forms

**JavaScript and TypeScript.** ES modules with `import type` where the type is all you need;
`const` by default; `??`, `?.`, `??=`; `structuredClone`; `Object.groupBy`; `Array.prototype`
`at`, `toSorted`, `toReversed`, `findLast`, `with`; `Set` methods (`union`, `intersection`,
`difference`); iterator helpers (`map`, `filter`, `take` on iterators); `Promise.withResolvers`,
`Promise.try`; `RegExp.escape`; `Uint8Array` base64 and hex helpers; `using` for anything
disposable when the target supports explicit resource management; `AbortSignal.timeout` and
`AbortSignal.any`; `Intl` for dates, numbers, lists, plurals and durations instead of hand
formatting. In TypeScript: `satisfies`, `const` type parameters, discriminated unions over boolean
flags, `unknown` in catch clauses, no `enum`, no namespaces, no parameter properties, `type` over
`interface` unless declaration merging is the point. TypeScript 7.0 (the Go compiler, released
2026-07-08) type-checks the same language about ten times faster; projects on Vue, Svelte, Astro,
MDX or Angular templates may still be pinned to 6.x, so use what the repository installs.

**CSS.** Native nesting, `:has()`, `:is()`, `:where()`, container queries and container units,
cascade layers (`@layer`), logical properties (`margin-inline`, `inset-block`), `clamp()` for fluid
type and space, `color-mix()`, `oklch()`, `light-dark()` with `color-scheme` for themes, `text-wrap:
balance` on headings and `pretty` on short prose, `font-variant-numeric: tabular-nums` for changing
numbers, `@starting-style` and `transition-behavior: allow-discrete` for entry and exit, view
transitions for page and state changes, `scroll-margin` and `scroll-snap`, `content-visibility` for
long lists, `field-sizing: content` for growing inputs, `subgrid` where a child must share its
parent's tracks, `dialog` and `popover` instead of hand-rolled overlays, `prefers-reduced-motion`
and `prefers-color-scheme` honoured. Custom properties carry the design tokens; magic numbers do
not appear twice.

**HTML.** Semantic elements before ARIA; `<button>` for actions and `<a>` for navigation; `<dialog>`,
`<details>`, `popover`, `inert`; `loading="lazy"` and explicit `width` and `height` on images;
`<picture>` and `srcset` for responsive images; `fetchpriority` on the hero image.

**React.** React 19 (latest patch 19.2.8, 2026-07-21): function components only, `ref` as an
ordinary prop (no `forwardRef`), Actions and `useActionState` for forms, `use` for promises and
context, Server Components and Server Functions where the framework offers them, `useEffectEvent`
for effect logic that reads latest values, `<Activity>` to keep hidden UI mounted, `startTransition`
for non-urgent updates. Derive state during render instead of syncing it with effects; effects are
for external systems only. Memoise when a profiler shows the cost, not by habit. The
`vercel-react-best-practices` and `vercel-composition-patterns` skills in the frontend pack carry
the detailed rules.

**Vue.** Vue 3.5 and later: `<script setup lang="ts">` only, `defineProps` and `defineEmits` with
types, `defineModel`, `useTemplateRef`, `useId`, composables for shared logic, Pinia setup stores,
Nuxt's `useFetch` and `useAsyncData` for SSR-safe data. Vapor mode (Vue 3.6) was at release-candidate
stage in July 2026: opt in only where the repository already does. The `vue-patterns` skill in the
frontend pack carries the detailed rules.

## 3. Verify before you rely on it

Browser support moves monthly. For any feature you have not shipped against this project's
browserslist before, check its Baseline status on MDN or web.dev before you use it: Baseline 2025
made view transitions, `popover`, `content-visibility`, iterator methods, `Promise.try`,
`RegExp.escape`, JSON import attributes and `Uint8Array` base64 available everywhere; Baseline 2026
added `field-sizing`, `shape()`, `:active-view-transition` and Trusted Types (web.dev/baseline,
read 2026-09-20). A feature outside the project's targets needs a fallback or a polyfill the
repository already ships, or it stays out. Never quote a version, a flag or an API from memory: open
the documentation, and name the source in your report when a choice depends on it.

## 4. What not to do

- Do not lower the language to what an older tutorial used: no `var`, no prototype chains, no
  `arguments`, no callback pyramids, no `any` to silence the compiler, no `!` non-null assertions
  where a check belongs, no `enum`.
- Do not add a dependency for what the platform now does (`lodash` for `groupBy`, `moment` for
  dates, `classnames` for one conditional class, a modal library for `<dialog>`).
- Do not introduce a second way to do something the repository already does one way.
- Do not describe the code in comments; make the names carry it, and put the reasoning in the
  commit message.
