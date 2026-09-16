import type { McpServerSpec } from "@ho/core";

const MCP_ROOT = "/opt/ho/mcp/node_modules";
const CHROMIUM = "/usr/lib/chromium/chromium";
export const BROWSER_OUTPUT_DIR = "/tmp/browser";

const SERVERS: Record<string, McpServerSpec> = {
  playwright: {
    kind: "stdio",
    command: "node",
    args: [
      `${MCP_ROOT}/@playwright/mcp/cli.js`,
      "--headless",
      "--browser",
      "chromium",
      "--executable-path",
      CHROMIUM,
      "--no-sandbox",
      "--isolated",
      "--output-dir",
      BROWSER_OUTPUT_DIR,
    ],
    env: { XDG_CONFIG_HOME: "/tmp/browser-config", XDG_CACHE_HOME: "/tmp/browser-cache" },
  },
  "chrome-devtools": {
    kind: "stdio",
    command: "node",
    args: [
      `${MCP_ROOT}/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js`,
      "--headless",
      "--isolated",
      "--executablePath",
      CHROMIUM,
      "--chromeArg=--no-sandbox",
      "--chromeArg=--disable-dev-shm-usage",
      "--no-usage-statistics",
    ],
    env: { XDG_CONFIG_HOME: "/tmp/browser-config", XDG_CACHE_HOME: "/tmp/browser-cache" },
  },
};

export const browserMcpServers = (devtools: boolean): Record<string, McpServerSpec> =>
  Object.fromEntries(Object.entries(SERVERS).filter(([name]) => name === "playwright" || devtools));
