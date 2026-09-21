export const LABELS = {
  managed: "ho.managed",
  kind: "ho.kind",
  session: "ho.session",
  task: "ho.task",
  project: "ho.project",
} as const;

export const MANAGED = { [LABELS.managed]: "true" } as const;
