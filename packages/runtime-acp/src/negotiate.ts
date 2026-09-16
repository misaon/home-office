import { type ClientConnection, type McpServer, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { RuntimeSessionSpec } from "@ho/core";
import { errorMessage } from "@ho/protocol";
import type { AcpPreset } from "./presets.ts";

const AUTH_REQUIRED = -32_000;
const NEGOTIATION_TIMEOUT_MS = 30_000;

export type Negotiated = {
  sessionId: string;
  resumed: boolean;
  servers: McpServer[];
};

export const isAuthRequired = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === AUTH_REQUIRED;

export const raceExit = async <T>(
  work: Promise<T>,
  exited: Promise<number | null>,
  describe: (code: number | null) => string,
  timeoutMs?: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const racers = [
      work,
      exited.then((code) => {
        throw new Error(describe(code));
      }),
    ];
    if (timeoutMs !== undefined) {
      racers.push(
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error("the agent did not answer in time"));
          }, timeoutMs);
        }),
      );
    }
    return await Promise.race(racers);
  } finally {
    clearTimeout(timer);
  }
};

const mcpServers = (spec: RuntimeSessionSpec): McpServer[] =>
  Object.entries(spec.mcpServers).map(([name, server]) =>
    server.kind === "http"
      ? {
          type: "http",
          name,
          url: server.url,
          headers: Object.entries(server.headers).map(([key, value]) => ({ name: key, value })),
        }
      : {
          name,
          command: server.command,
          args: [...server.args],
          env: Object.entries(server.env).map(([key, value]) => ({ name: key, value })),
        },
  );

export async function negotiate(
  conn: ClientConnection,
  preset: AcpPreset,
  spec: RuntimeSessionSpec,
  exited: Promise<number | null>,
  stderr: (text: string) => void,
  clientVersion: string,
): Promise<Negotiated> {
  const request = <T>(work: Promise<T>): Promise<T> =>
    raceExit(
      work,
      exited,
      (code) => `${preset.name} exited (code ${String(code)}) before answering`,
      NEGOTIATION_TIMEOUT_MS,
    );
  const { agent } = conn;
  const init = await request(
    agent.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "home-office", version: clientVersion },
    }),
  );
  if (init.agentCapabilities?.mcpCapabilities?.http !== true) {
    throw new Error(`${preset.name} does not accept HTTP MCP servers required by the office`);
  }
  const servers = mcpServers(spec);
  const open = async (): Promise<Negotiated> => {
    if (spec.resume !== null && init.agentCapabilities?.loadSession === true) {
      try {
        await request(
          agent.request("session/load", {
            sessionId: spec.resume,
            cwd: spec.cwd,
            mcpServers: servers,
          }),
        );
        return { sessionId: spec.resume, resumed: true, servers };
      } catch (error) {
        stderr(`session/load failed (${errorMessage(error)}); starting a new conversation`);
      }
    }
    const created = await request(
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
    await request(agent.request("authenticate", { methodId: method.id }));
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
