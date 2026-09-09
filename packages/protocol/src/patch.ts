export const compact = <T extends object>(
  patch: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } => {
  const kept = Object.entries(patch).filter(([, value]) => value !== undefined);
  /* oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.fromEntries cannot express the mapped type */
  return Object.fromEntries(kept) as { [K in keyof T]?: Exclude<T[K], undefined> };
};
