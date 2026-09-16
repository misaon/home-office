import { resolveHome } from "@ho/daemon";
import { errorMessage, TOKEN_STORAGE_KEY } from "@ho/protocol";
import Electrobun, { BrowserWindow, PATHS, Utils } from "electrobun/main";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { attachOrStart, type DaemonLink } from "./daemon.ts";
import { installMenu } from "./menu.ts";
import { widenPath } from "./path.ts";

const ClosedWindow = z.object({ data: z.object({ id: z.number() }) });
const BeforeQuit = z.object({ responseWasSet: z.boolean() });
const holdsQuit = (event: unknown): event is { responseWasSet: boolean } =>
  BeforeQuit.safeParse(event).success;
const OpenedUrl = z.object({
  data: z.object({ detail: z.union([z.string(), z.object({ url: z.string() })]) }),
});

const fatal = async (message: string, detail: string): Promise<never> => {
  await Utils.showMessageBox({ type: "error", title: "Home Office", message, detail });
  Utils.quit(1);
  return new Promise<never>(() => {});
};

function openWindow(link: DaemonLink): BrowserWindow {
  return new BrowserWindow({
    title: "Home Office",
    url: link.url,
    preload: `try { sessionStorage.setItem(${JSON.stringify(TOKEN_STORAGE_KEY)}, ${JSON.stringify(link.token)}); } catch {}`,
    frame: { width: 1440, height: 900 },
  });
}

async function main(): Promise<void> {
  widenPath();
  const home = resolveHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  const resourcesRoot = Bun.env["HO_REPO_ROOT"] ?? resolve(PATHS.RESOURCES_FOLDER, "app/ho");
  const logFile = join(home, "logs", "desktop.log");
  let link: DaemonLink;
  try {
    link = await attachOrStart({ home, resourcesRoot, logFile });
  } catch (error) {
    await fatal(
      "The office could not start.",
      `${errorMessage(error)}\n\nLogs: ${logFile}\nIs another Home Office or \`ho daemon\` using port 47800?`,
    );
    return;
  }

  let stopping: Promise<void> | null = null;
  let stopped = false;
  const shutdown = (): Promise<void> => {
    stopping ??= link
      .stop()
      .catch(() => undefined)
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

  Electrobun.events.on("before-quit", (event: unknown) => {
    if (stopped) {
      return;
    }
    if (holdsQuit(event)) {
      Object.assign(event, { response: { allow: false } });
    }
    quitAfterShutdown();
  });

  const win = openWindow(link);
  Electrobun.events.on("close", (event: unknown) => {
    const closed = ClosedWindow.safeParse(event);
    if (closed.success && closed.data.data.id === win.id) {
      quitAfterShutdown();
    }
  });
  Electrobun.events.on("new-window-open", (event: unknown) => {
    const opened = OpenedUrl.safeParse(event);
    if (!opened.success) {
      return;
    }
    const { detail } = opened.data.data;
    const url = typeof detail === "string" ? detail : detail.url;
    if (/^https?:\/\//u.test(url) && new URL(url).origin !== new URL(link.url).origin) {
      Utils.openExternal(url);
    }
  });

  installMenu({
    reload: () => {
      win.webview.loadURL(link.url);
    },
    openInBrowser: () => {
      Utils.openExternal(link.officeUrl);
    },
    openLogs: () => {
      Utils.openPath(join(home, "logs"));
    },
  });
}

try {
  await main();
} catch (error) {
  await fatal("Home Office hit an unexpected error.", errorMessage(error));
}
