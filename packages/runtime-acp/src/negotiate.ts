import {
  type ClientConnection,
  type McpServer,
  PROTOCOL_VERSION,
  type SessionConfigOption,
} from "@agentclientprotocol/sdk";
import type { RuntimeSessionSpec } from "@ho/core";
import { errorMessage } from "@ho/protocol";
import type { AcpPreset } from "./presets.ts";

const AUTH_REQUIRED = -32_000;
const NEGOTIATION_TIMEOUT_MS = 30_000;

export type Negotiated = {
  sessionId: string;
  resumed: boolean;
  servers: McpServer[];
  model: string | null;
  effort: string | null;
};

type Effective = { model: string | null; effort: string | null };

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

const selectionOf = (
  options: readonly SessionConfigOption[] | null | undefined,
  category: "model" | "thought_level",
): Extract<SessionConfigOption, { type: "select" }> | undefined =>
  options?.find(
    (option): option is Extract<SessionConfigOption, { type: "select" }> =>
      option.type === "select" && option.category === category,
  );

const choicesOf = (
  option: Extract<SessionConfigOption, { type: "select" }>,
): { value: string; name: string }[] =>
  option.options.flatMap((entry) => ("group" in entry ? entry.options : [entry]));

const labelOf = (option: Extract<SessionConfigOption, { type: "select" }>): string =>
  choicesOf(option).find((choice) => choice.value === option.currentValue)?.name ??
  option.currentValue;

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
  const configure = async (
    sessionId: string,
    options: readonly SessionConfigOption[] | null = null,
  ): Promise<Effective> => {
    let current = options;
    const wanted = { model: spec.model, thought_level: spec.effort } as const;
    for (const category of ["model", "thought_level"] as const) {
      const option = selectionOf(current, category);
      const value = wanted[category];
      if (
        option === undefined ||
        option.currentValue === value ||
        !choicesOf(option).some((choice) => choice.value === value)
      ) {
        continue;
      }
      try {
        const updated = await request(
          agent.request("session/set_config_option", { sessionId, configId: option.id, value }),
        );
        current = updated.configOptions;
      } catch (error) {
        stderr(`session/set_config_option ${category} failed (${errorMessage(error)})`);
      }
    }
    const model = selectionOf(current, "model");
    const effort = selectionOf(current, "thought_level");
    const effective = {
      model: model === undefined ? null : labelOf(model),
      effort: effort === undefined ? null : labelOf(effort),
    };
    if (effective.model !== null && effective.model !== spec.model) {
      stderr(`the agent runs model ${effective.model}, not the configured ${spec.model}`);
    }
    return effective;
  };
  const open = async (): Promise<Negotiated> => {
    if (spec.resume !== null && init.agentCapabilities?.loadSession === true) {
      try {
        const loaded = await request(
          agent.request("session/load", {
            sessionId: spec.resume,
            cwd: spec.cwd,
            mcpServers: servers,
          }),
        );
        const effective = await configure(spec.resume, loaded.configOptions ?? null);
        return { sessionId: spec.resume, resumed: true, servers, ...effective };
      } catch (error) {
        stderr(`session/load failed (${errorMessage(error)}); starting a new conversation`);
      }
    }
    const created = await request(
      agent.request("session/new", { cwd: spec.cwd, mcpServers: servers }),
    );
    const effective = await configure(created.sessionId, created.configOptions ?? null);
    return { sessionId: created.sessionId, resumed: false, servers, ...effective };
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
