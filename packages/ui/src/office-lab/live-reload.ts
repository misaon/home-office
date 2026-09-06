import { useEffect, useState } from "react";

/** Only the standalone lab server exposes this endpoint; the normal daemon needs no polling. */
export function useLabReload(): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    let previous: string | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch("/__office_lab_revision", {
          cache: "no-store",
          signal: controller.signal,
        });
        const version = await response.text();
        if (!response.ok || !/^office-lab:\d+$/u.test(version)) {
          return;
        }
        setLive(true);
        if (previous !== null && previous !== version) {
          window.location.reload();
          return;
        }
        previous = version;
      } catch {
        // The local server may be restarting; keep the last rendered scene visible.
      }
      if (!stopped) {
        timer = setTimeout(() => {
          void poll();
        }, 1000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return live;
}
