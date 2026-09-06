import { ApplicationMenu, type ApplicationMenuItemConfig, Utils } from "electrobun/main";

export type MenuActions = {
  reload: () => void;
  openInBrowser: () => void;
  openLogs: () => void;
};

const REPOSITORY = "https://github.com/misaon/home-office";

const ACTION = {
  reload: "ho.reload",
  openInBrowser: "ho.open-browser",
  openLogs: "ho.open-logs",
  github: "ho.github",
} as const;

const MENU: ApplicationMenuItemConfig[] = [
  {
    label: "Home Office",
    submenu: [
      { role: "about" },
      { type: "divider" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "showAll" },
      { type: "divider" },
      { role: "quit", accelerator: "CmdOrCtrl+Q" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "divider" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "Office",
    submenu: [
      { label: "Reload", action: ACTION.reload, accelerator: "CmdOrCtrl+R" },
      { label: "Open in Browser", action: ACTION.openInBrowser },
      { type: "divider" },
      { label: "Show Logs", action: ACTION.openLogs },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "divider" },
      { role: "bringAllToFront" },
    ],
  },
  {
    label: "Help",
    submenu: [{ label: "Home Office on GitHub", action: ACTION.github }],
  },
];

const actionOf = (event: unknown): string | null => {
  if (typeof event !== "object" || event === null || !("data" in event)) {
    return null;
  }
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null || !("action" in data)) {
    return null;
  }
  return typeof data.action === "string" ? data.action : null;
};

/** Native application menu; roles are handled by macOS, actions come back as `application-menu-clicked`. */
export function installMenu(actions: MenuActions): void {
  ApplicationMenu.setApplicationMenu(MENU);
  const handlers: Record<string, () => void> = {
    [ACTION.reload]: actions.reload,
    [ACTION.openInBrowser]: actions.openInBrowser,
    [ACTION.openLogs]: actions.openLogs,
    [ACTION.github]: () => {
      Utils.openExternal(REPOSITORY);
    },
  };
  ApplicationMenu.on("application-menu-clicked", (event) => {
    const action = actionOf(event);
    if (action !== null) {
      handlers[action]?.();
    }
  });
}
