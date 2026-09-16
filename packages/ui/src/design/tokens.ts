import type { Priority } from "./data.ts";

export const pill = (on: boolean): string =>
  on
    ? "border border-accent-a45 bg-accent-a12 text-accent-soft"
    : "border border-border bg-card text-ink-quiet";

export const priority = (p: Priority): string =>
  p === "high"
    ? "bg-bad-a15 text-bad-soft"
    : p === "low"
      ? "bg-chip text-ink-faint"
      : "bg-accent-a14 text-accent-soft";

export const priorityInk = (p: Priority): string =>
  p === "high" ? "text-bad-soft" : p === "low" ? "text-ink-faint" : "text-accent-soft";

export const priorityDot = (p: Priority): string =>
  p === "high" ? "bg-bad-soft" : p === "low" ? "bg-ink-faint" : "bg-accent-soft";

export const separator = (first: boolean): string =>
  first ? "border-t border-transparent" : "border-t border-rule";

export const MONO = "font-mono";
export const DISPLAY = "font-display";

declare module "react" {
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface CSSProperties {
    // oxlint-disable-next-line typescript/consistent-indexed-object-style
    [name: `--${string}`]: string | number | undefined;
  }
}
