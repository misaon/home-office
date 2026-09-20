const pad = (v: number): string => String(v).padStart(2, "0");

export const clock = (iso: string, seconds = false): string => {
  const at = new Date(iso);
  const parts = seconds
    ? [at.getHours(), at.getMinutes(), at.getSeconds()]
    : [at.getHours(), at.getMinutes()];
  return parts.map((v) => pad(v)).join(":");
};

const minutesSince = (iso: string, now: number): number =>
  Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));

export const since = (iso: string, now: number): string => {
  const minutes = minutesSince(iso, now);
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${String(hours)} h` : `${String(Math.round(hours / 24))} d`;
};

export const elapsed = (iso: string, now: number): string => {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) {
    return `${String(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${String(minutes)}m ${String(seconds % 60)}s`
    : `${String(Math.floor(minutes / 60))}h ${String(minutes % 60)}m`;
};

export const ago = (iso: string, now: number): string => {
  const minutes = minutesSince(iso, now);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `-${String(minutes)}m`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `-${String(hours)}h` : `-${String(Math.round(hours / 24))}d`;
};
