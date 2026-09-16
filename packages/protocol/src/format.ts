const UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;

export const formatBytes = (bytes: number | null): string => {
  if (bytes === null) {
    return "–";
  }
  let size = Math.abs(bytes);
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const shown = unit === 0 ? String(Math.round(size)) : size.toFixed(size < 10 ? 1 : 0);
  return `${bytes < 0 ? "-" : ""}${shown} ${UNITS[unit] ?? "B"}`;
};
