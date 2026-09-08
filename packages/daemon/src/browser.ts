import type { McpServerSpec } from "@ho/core";

/** Where the sandbox image keeps the preinstalled MCP servers and the distribution's Chromium (images/agent). */
const MCP_ROOT = "/opt/ho/mcp/node_modules";
const CHROMIUM = "/usr/lib/chromium/chromium";
/** Screenshots and traces land on the sandbox tmpfs; agents copy what belongs in the repository. */
export const BROWSER_OUTPUT_DIR = "/tmp/browser";

/**
 * Headless browser tooling inside the sandbox (D15): Playwright MCP for driving pages and Chrome DevTools MCP for
 * performance, network and console. Chromium runs without its own sandbox because the container (CapDrop ALL,
 * no-new-privileges, read-only rootfs) is the sandbox and user namespaces are unavailable to it.
 */
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
