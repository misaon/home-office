// A minimal ACP agent over stdio, built with the official SDK's app API, that exercises everything
// @ho/runtime-acp relies on: version negotiation, auth_required → authenticate, session/new with MCP
// servers, streamed message chunks, a tool call with a permission request, and the end_turn stop reason.
import { agent, type McpServer, ndJsonStream, RequestError } from "@agentclientprotocol/sdk";

let authenticated = false;
let servers: McpServer[] = [];

const stdout = new WritableStream<Uint8Array>({
  write(chunk) {
    process.stdout.write(chunk);
  },
});

agent({ name: "mock-acp-agent" })
  .onRequest("initialize", () => ({
    protocolVersion: 1,
    agentCapabilities: { loadSession: false, mcpCapabilities: { http: true, sse: false } },
    agentInfo: { name: "mock-acp-agent", version: "0.0.0" },
    authMethods: [
      { id: "api-key", name: "API key", description: "MOCK_API_KEY in the environment" },
    ],
  }))
  .onRequest("authenticate", (cx) => {
    if (cx.params.methodId !== "api-key" || Bun.env["MOCK_API_KEY"] === undefined) {
      throw RequestError.authRequired();
    }
    authenticated = true;
    return {};
  })
  .onRequest("session/new", (cx) => {
    if (!authenticated) {
      throw RequestError.authRequired();
    }
    servers = cx.params.mcpServers;
    return { sessionId: `mock-${String(Date.now())}` };
  })
  .onRequest("session/prompt", async (cx) => {
    const { sessionId } = cx.params;
    const text = cx.params.prompt.map((b) => (b.type === "text" ? b.text : "")).join("");
    const say = (chunk: string): Promise<void> =>
      cx.client.notify("session/update", {
        sessionId,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: chunk } },
      });
    await say(
      `Got ${String(text.length)} chars and ${String(servers.length)} MCP servers (${servers.map((s) => s.name).join(", ")}). `,
    );
    await cx.client.notify("session/update", {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call-1",
        title: "Read README.md",
        kind: "read",
        status: "pending",
        rawInput: { path: "README.md" },
      },
    });
    const permission = await cx.client.request("session/request_permission", {
      sessionId,
      toolCall: { toolCallId: "call-1", title: "Read README.md" },
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "always", name: "Always allow", kind: "allow_always" },
        { optionId: "reject", name: "Reject", kind: "reject_once" },
      ],
    });
    const granted = permission.outcome.outcome === "selected";
    await cx.client.notify("session/update", {
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call-1",
        status: granted ? "completed" : "failed",
        content: [
          {
            type: "content",
            content: { type: "text", text: granted ? "# intake demo" : "denied" },
          },
        ],
      },
    });
    await say(granted ? "Done: the README has one heading." : "Could not read.");
    return { stopReason: "end_turn" };
  })
  .onNotification("session/cancel", () => undefined)
  .connect(ndJsonStream(stdout, Bun.stdin.stream()));
