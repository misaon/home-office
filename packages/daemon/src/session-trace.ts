import type { RuntimeEvent } from "@ho/protocol";

const TRACE_MAX = 300;

const shorten = (value: unknown): string => {
  if (value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length <= TRACE_MAX ? text : `${text.slice(0, TRACE_MAX)}…`;
};

const MISSING = [
  /(?<tool>[\w./-]+): (?:command )?not found/iu,
  /command not found: (?<tool>[\w./-]+)/iu,
  /(?<tool>[\w./-]+): unrecognized option/iu,
  /unknown (?:command|option) ["']?(?<tool>[\w./-]+)/iu,
];

export const gapOf = (event: RuntimeEvent): { tool: string; detail: string } | null => {
  if (event.kind !== "tool_result" || event.ok) {
    return null;
  }
  for (const pattern of MISSING) {
    const found = pattern.exec(event.summary);
    if (found !== null) {
      return { tool: found.groups?.["tool"] ?? "", detail: found[0].slice(0, 200) };
    }
  }
  return null;
};

export const traceOf = (event: RuntimeEvent): Record<string, unknown> | null => {
  switch (event.kind) {
    case "text_delta": {
      return null;
    }
    case "init": {
      return {
        model: event.model,
        runtimeSessionId: event.runtimeSessionId,
        tools: event.tools,
        mcpServers: event.mcpServers,
        plugins: event.plugins,
        pluginErrors: event.pluginErrors,
      };
    }
    case "tool_call": {
      return { id: event.id, tool: event.name, input: shorten(event.input) };
    }
    case "tool_result": {
      return { id: event.id, ok: event.ok, summary: shorten(event.summary) };
    }
    case "permission_request": {
      return { id: event.id, tool: event.tool, input: shorten(event.input) };
    }
    case "usage": {
      return { ...event.usage };
    }
    case "context": {
      return {
        usedTokens: event.usedTokens,
        windowTokens: event.windowTokens,
        fill:
          event.windowTokens === 0
            ? null
            : Math.round((event.usedTokens / event.windowTokens) * 100),
        cost: event.cost,
      };
    }
    case "rate_limited": {
      return { retryAt: event.retryAt };
    }
    case "result": {
      return {
        ok: event.ok,
        turns: event.turns,
        runtimeSessionId: event.runtimeSessionId,
        text: shorten(event.text),
      };
    }
    case "error": {
      return { code: event.code, message: shorten(event.message) };
    }
  }
  return null;
};
