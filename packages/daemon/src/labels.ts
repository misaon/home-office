/** Docker labels every container, volume, network and image the office owns carries. */
export const LABELS = {
  managed: "ho.managed",
  kind: "ho.kind",
  session: "ho.session",
  project: "ho.project",
} as const;

export const MANAGED = { [LABELS.managed]: "true" } as const;
