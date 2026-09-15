import type { Priority } from "./data.ts";

/**
 * The few parts of the drawing that depend on state rather than place. Each returns the classes that
 * state is painted in, so a component spends them exactly as it spends any other utility.
 */

/** A filter pill, on or off. */
export const pill = (on: boolean): string =>
  on
    ? "border border-accent-a45 bg-accent-a12 text-accent-soft"
    : "border border-border bg-card text-ink-quiet";

/** The colours a priority is written in. */
export const priority = (p: Priority): string =>
  p === "high"
    ? "bg-bad-a15 text-bad-soft"
    : p === "low"
      ? "bg-chip text-ink-faint"
      : "bg-accent-a14 text-accent-soft";

/** The mark a priority puts in front of its name. */
export const priorityInk = (p: Priority): string =>
  p === "high" ? "text-bad-soft" : p === "low" ? "text-ink-faint" : "text-accent-soft";

export const priorityDot = (p: Priority): string =>
  p === "high" ? "bg-bad-soft" : p === "low" ? "bg-ink-faint" : "bg-accent-soft";

/** A row that only draws a rule when something sits above it. */
export const separator = (first: boolean): string =>
  first ? "border-t border-transparent" : "border-t border-rule";

export const MONO = "font-mono";
export const DISPLAY = "font-display";

/**
 * The office spends a handful of CSS custom properties as inline values — a width the layout
 * measures, a share of a bar, a delay that staggers three dots — and reads each back from a Tailwind
 * utility such as `w-(--sheet)`. React's own `CSSProperties` has no room for a name it does not know,
 * so the room is made here once rather than asserted at each of the twelve places.
 */
declare module "react" {
  // `interface` is not a choice: augmenting React's own interface is the only way to widen it.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface CSSProperties {
    // Nor is the index signature: a `Record` would replace the name rather than widen it, which is
    // what `--fix` did once and what took every real CSS property out of the build with it.
    // oxlint-disable-next-line typescript/consistent-indexed-object-style
    [name: `--${string}`]: string | number | undefined;
  }
}
