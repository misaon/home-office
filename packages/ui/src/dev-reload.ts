import { useEffect } from "react";

const REVISION_URL = "/dev-revision.txt";
const POLL_MS = 1000;

export function useDevReload(): void {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return undefined;
    }
    let previous: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(REVISION_URL, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const text = await response.text();
          const revision = text.trim();
          if (previous !== null && revision !== previous) {
            window.location.reload();
            return;
          }
          previous = revision;
        }
      } catch {}
      if (!controller.signal.aborted) {
        timer = setTimeout(() => {
          void poll();
        }, POLL_MS);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
}
