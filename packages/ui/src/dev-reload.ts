import { useEffect } from "react";

const REVISION_URL = "/dev-revision.txt";
const POLL_MS = 1000;

/**
 * Development only: `bun run ui:watch` writes a revision file after every rebuild and the page reloads when
 * it changes. The check is compiled out of production bundles (NODE_ENV is defined at build time).
 */
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
          const revision = (await response.text()).trim();
          if (previous !== null && revision !== previous) {
            window.location.reload();
            return;
          }
          previous = revision;
        }
      } catch {
        // The daemon may be restarting; keep the current page.
      }
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
