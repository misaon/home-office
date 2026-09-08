import type { ClientConnection, McpServer } from "@agentclientprotocol/sdk";
import type { RuntimeSessionSpec } from "@ho/core";
import type { AcpPreset } from "./presets.ts";

const PROTOCOL_VERSION = 1;
const AUTH_REQUIRED = -32000;

export type Negotiated = {
  sessionId: string;
  /** True when the agent restored the previous conversation (the prompt appendix is already in it). */
  resumed: boolean;
  servers: McpServer[];
};

export const isAuthRequired = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === AUTH_REQUIRED;

export const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** HO's MCP server (http) and the sandbox-local browser servers (stdio) in ACP's shape. */
function mcpServers(spec: RuntimeSessionSpec, http: boolean): McpServer[] {
  const servers: McpServer[] = [];
  for (const [name, server] of Object.entries(spec.mcpServers)) {
    if (server.kind === "http") {
      if (http) {
        servers.push({
          type: "http",
          name,
          url: server.url,
          headers: Object.entries(server.headers).map(([key, value]) => ({ name: key, value })),
        });
      }
    } else {
      servers.push({
        name,
        command: server.command,
        args: [...server.args],
        env: Object.entries(server.env).map(([key, value]) => ({ name: key, value })),
      });
    }
  }
  return servers;
}

/**
 * initialize → (authenticate on demand) → session/load when possible, else session/new. Every request races
 * the agent's exit so a CLI that dies (missing binary, bad key) fails fast with its exit code.
 */
export async function negotiate(
  conn: ClientConnection,
  preset: AcpPreset,
  spec: RuntimeSessionSpec,
  exited: Promise<number | null>,
  stderr: (text: string) => void,
  lastStderr: () => string,
): Promise<Negotiated> {
  const exitFirst = async <T>(work: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        exited.then((code) => {
          throw new Error(
            `${preset.name} exited (code ${String(code)}) before answering${lastStderr()}`,
          );
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`${preset.name} negotiation timed out`));
          }, 30_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const agent = conn.agent;
  const init = await exitFirst(
    agent.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "home-office", version: "0.1.0" },
    }),
  );
  const http = init.agentCapabilities?.mcpCapabilities?.http === true;
  const servers = mcpServers(spec, http);
  if (!http && Object.values(spec.mcpServers).some((s) => s.kind === "http")) {
    throw new Error(`${preset.name} does not accept HTTP MCP servers required by the office`);
  }
  const open = async (): Promise<Negotiated> => {
    if (spec.resume !== null && init.agentCapabilities?.loadSession === true) {
      try {
        await exitFirst(
          agent.request("session/load", {
            sessionId: spec.resume,
            cwd: spec.cwd,
            mcpServers: servers,
          }),
        );
        return { sessionId: spec.resume, resumed: true, servers };
      } catch (error) {
        stderr(`session/load failed (${describe(error)}); starting a new conversation`);
      }
    }
    const created = await exitFirst(
      agent.request("session/new", { cwd: spec.cwd, mcpServers: servers }),
    );
    return { sessionId: created.sessionId, resumed: false, servers };
  };
  const authenticate = async (): Promise<void> => {
    const methods = init.authMethods ?? [];
    const method =
      preset.authMethods
        .map((id) => methods.find((m) => m.id === id))
        .find((m) => m !== undefined) ??
      methods.find((m) => m.id.toLowerCase().includes("api")) ??
      methods[0];
    if (method === undefined) {
      throw new Error(`${preset.name} requires authentication but offers no method`);
    }
    await exitFirst(agent.request("authenticate", { methodId: method.id }));
  };
  try {
    return await open();
  } catch (error) {
    if (!isAuthRequired(error)) {
      throw error;
    }
    await authenticate();
    return open();
  }
}
