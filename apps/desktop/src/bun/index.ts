// Home Office desktop main process (Bun inside Electrobun): runs @ho/daemon in-process and shows the office
// UI the daemon serves. Native concerns only live here (window, menu, dialogs, external links, quitting);
// everything else goes through the same oRPC contract the browser UI and the CLI use.
import { resolveHome } from "@ho/daemon";
import Electrobun, { BrowserWindow, type ElectrobunEvent, PATHS, Utils } from "electrobun/main";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { attachOrStart, type DaemonLink } from "./daemon.ts";
import { acquireLock } from "./lock.ts";
import { installMenu } from "./menu.ts";
import { widenPath } from "./path.ts";

const STOP_TIMEOUT_MS = 20_000;
const TOKEN_KEY = "ho.token";

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const fatal = async (message: string, detail: string): Promise<never> => {
  await Utils.showMessageBox({ type: "error", title: "Home Office", message, detail });
  Utils.quit(1);
  return new Promise<never>(() => {
    // The native side tears the process down.
  });
};

/** `before-quit` and window events arrive untyped from the emitter; only the shape we use is checked. */
const isQuitEvent = (
  event: unknown,
): event is ElectrobunEvent<Record<string, never>, { allow: boolean }> =>
  typeof event === "object" && event !== null && "responseWasSet" in event;

const closedWindowId = (event: unknown): number | null => {
  if (typeof event !== "object" || event === null || !("data" in event)) {
    return null;
  }
  const data: unknown = event.data;
  return typeof data === "object" && data !== null && "id" in data && typeof data.id === "number"
    ? data.id
    : null;
};

const openedUrl = (event: unknown): string | null => {
  if (typeof event !== "object" || event === null || !("data" in event)) {
    return null;
  }
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return null;
  }
  const detail: unknown = data.detail;
  if (typeof detail === "string") {
    return detail;
  }
  return typeof detail === "object" &&
    detail !== null &&
    "url" in detail &&
    typeof detail.url === "string"
    ? detail.url
    : null;
};

function openWindow(link: DaemonLink): BrowserWindow {
  // The token never appears in a URL: a preload statement parks it in sessionStorage, where the office UI
  // looks for it (the same place `ho ui` moves the URL fragment to).
  return new BrowserWindow({
    title: "Home Office",
    url: link.url,
    preload: `try { sessionStorage.setItem(${JSON.stringify(TOKEN_KEY)}, ${JSON.stringify(link.token)}); } catch {}`,
    frame: { width: 1440, height: 900 },
  });
}

async function main(): Promise<void> {
  widenPath();
  const home = resolveHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  const release = await acquireLock(join(home, "desktop.lock"));
  if (release === null) {
    await Utils.showMessageBox({
      type: "info",
      title: "Home Office",
      message: "Home Office is already running.",
      detail: "Switch to the open window; a second instance would share the same office database.",
    });
    Utils.quit(0);
    return;
  }

  const resourcesRoot = Bun.env["HO_REPO_ROOT"] ?? resolve(PATHS.RESOURCES_FOLDER, "app/ho");
  const logFile = join(home, "logs", "desktop.log");
  let link: DaemonLink;
  try {
    link = await attachOrStart({ home, resourcesRoot, logFile });
  } catch (error) {
    await release();
    await fatal(
      "The office could not start.",
      `${describe(error)}\n\nLogs: ${logFile}\nIs another Home Office or \`ho daemon\` using port 47800?`,
    );
    return;
  }

  let stopping: Promise<void> | null = null;
  let stopped = false;
  const shutdown = (): Promise<void> => {
    stopping ??= Promise.race([
      link.stop(),
      new Promise<void>((done) => {
        setTimeout(done, STOP_TIMEOUT_MS);
      }),
    ])
      .catch(() => undefined)
      .then(release)
      .then(() => {
        stopped = true;
      });
    return stopping;
  };
  const quitAfterShutdown = (): void => {
    void shutdown().then(() => {
      Utils.quit(0);
    });
  };

  // Quitting (Cmd+Q, SIGTERM, dock) first stops sessions and removes daemon.json, then really quits.
  Electrobun.events.on("before-quit", (event: unknown) => {
    if (!stopped && isQuitEvent(event)) {
      event.response = { allow: false };
      quitAfterShutdown();
    }
  });

  const win = openWindow(link);
  Electrobun.events.on("close", (event: unknown) => {
    if (closedWindowId(event) === win.id) {
      quitAfterShutdown();
    }
  });
  // Links the UI opens in a new tab (pull requests) go to the default browser.
  Electrobun.events.on("new-window-open", (event: unknown) => {
    const url = openedUrl(event);
    if (
      url !== null &&
      /^https?:\/\//u.test(url) &&
      new URL(url).origin !== new URL(link.url).origin
    ) {
      Utils.openExternal(url);
    }
  });

  installMenu({
    reload: () => {
      win.webview.loadURL(link.url);
    },
    openInBrowser: () => {
      Utils.openExternal(`${link.url}#token=${link.token}`);
    },
    openLogs: () => {
      Utils.openPath(join(home, "logs"));
    },
  });
}

try {
  await main();
} catch (error) {
  await fatal("Home Office hit an unexpected error.", describe(error));
}
