// Spike S1: Claude Code headless inside the Alpine agent image, authenticated with the owner's
// subscription token read from the macOS Keychain. The token travels Keychain -> this process ->
// Docker API JSON body only; it is never printed, logged or passed on a command line.
import { $ } from "bun";
import { z } from "zod";

const SOCKET = "/var/run/docker.sock";
const API = "v1.55";
const IMAGE = "ho/agent:spike";
const LABELS = { "ho.managed": "true", "ho.kind": "spike" };

async function docker(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  const init: BunFetchRequestInit = {
    method,
    unix: SOCKET,
    headers: { "content-type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`http://docker/${API}${path}`, init);
  if (!res.ok) {
    throw new Error(`docker ${method} ${path} -> ${String(res.status)}: ${await res.text()}`);
  }
  return res;
}

function demux(buffer: Uint8Array): string {
  const decoder = new TextDecoder();
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  let out = "";
  while (offset + 8 <= buffer.byteLength) {
    const size = view.getUint32(offset + 4);
    out += decoder.decode(buffer.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size;
  }
  return out;
}

const Created = z.object({ Id: z.string() });
const Waited = z.object({ StatusCode: z.number() });
const Init = z.object({
  type: z.literal("system"),
  subtype: z.literal("init"),
  model: z.string(),
  session_id: z.string(),
  tools: z.array(z.string()).optional(),
  mcp_servers: z.array(z.unknown()).optional(),
  plugins: z.array(z.unknown()).optional(),
});
const Result = z.object({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string().optional(),
  session_id: z.string(),
  num_turns: z.number(),
  duration_ms: z.number(),
  duration_api_ms: z.number().optional(),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
    })
    .optional(),
});
const AnyLine = z.object({ type: z.string(), subtype: z.string().optional() });

type RunOutcome = {
  init: z.infer<typeof Init> | null;
  result: z.infer<typeof Result> | null;
  kinds: string[];
  wallMs: number;
  exit: number;
  raw: string;
};

async function runClaude(
  name: string,
  args: readonly string[],
  env: readonly string[],
  volume: string,
): Promise<RunOutcome> {
  const t0 = performance.now();
  const { Id } = Created.parse(
    await (
      await docker("POST", `/containers/create?name=${name}`, {
        Image: IMAGE,
        Cmd: ["claude", ...args],
        User: "1000:1000",
        WorkingDir: "/work",
        Env: [...env],
        Labels: LABELS,
        HostConfig: {
          Mounts: [{ Type: "volume", Source: volume, Target: "/home/agent/.claude" }],
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges"],
          ReadonlyRootfs: true,
          Tmpfs: { "/tmp": "rw,nosuid,size=128m", "/work": "rw,nosuid,size=64m,uid=1000,gid=1000" },
          Memory: 1024 * 1024 * 1024,
          NanoCpus: 2_000_000_000,
          PidsLimit: 256,
          Init: true,
        },
      })
    ).json(),
  );
  try {
    await docker("POST", `/containers/${Id}/start`);
    const { StatusCode } = Waited.parse(
      await (await docker("POST", `/containers/${Id}/wait`)).json(),
    );
    const raw = demux(
      new Uint8Array(
        await (await docker("GET", `/containers/${Id}/logs?stdout=1&stderr=1`)).arrayBuffer(),
      ),
    );
    let init: z.infer<typeof Init> | null = null;
    let result: z.infer<typeof Result> | null = null;
    const kinds: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line.startsWith("{")) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const head = AnyLine.safeParse(parsed);
      if (head.success) {
        kinds.push(
          head.data.subtype === undefined
            ? head.data.type
            : `${head.data.type}/${head.data.subtype}`,
        );
      }
      const asInit = Init.safeParse(parsed);
      if (asInit.success) {
        init = asInit.data;
      }
      const asResult = Result.safeParse(parsed);
      if (asResult.success) {
        result = asResult.data;
      }
    }
    return { init, result, kinds, wallMs: performance.now() - t0, exit: StatusCode, raw };
  } finally {
    await docker("DELETE", `/containers/${Id}?v=1&force=1`).catch(() => null);
  }
}

const token = (
  await $`security find-generic-password -s home-office -a anthropic-oauth-token -w`
    .quiet()
    .nothrow()
    .text()
).trim();
if (token === "") {
  process.stdout.write(
    "S1 BLOCKED: no token in Keychain. Run `claude setup-token`, then `security add-generic-password -U -s home-office -a anthropic-oauth-token -w`.\n",
  );
  process.exit(2);
}

const baseEnv = [`CLAUDE_CODE_OAUTH_TOKEN=${token}`, "HOME=/home/agent", "TERM=dumb"];
const common = [
  "--output-format",
  "stream-json",
  "--verbose",
  "--model",
  "haiku",
  "--effort",
  "low",
  "--max-turns",
  "1",
  "--permission-mode",
  "bypassPermissions",
  "--setting-sources",
  "user",
  "--strict-mcp-config",
];
const volume = `ho-spike-s1-cfg-${crypto.randomUUID().slice(0, 8)}`;
await docker("POST", "/volumes/create", { Name: volume, Labels: LABELS });

const summary = (o: RunOutcome): string =>
  `exit=${String(o.exit)} wall=${o.wallMs.toFixed(0)}ms subtype=${o.result?.subtype ?? "-"} error=${String(o.result?.is_error ?? "-")} turns=${String(o.result?.num_turns ?? "-")} api=${String(o.result?.duration_api_ms ?? "-")}ms usage=${JSON.stringify(o.result?.usage ?? null)} model=${o.init?.model ?? "-"} tools=${String(o.init?.tools?.length ?? "-")} events=${o.kinds.join(",")}`;

try {
  const first = await runClaude(
    `ho-spike-s1-a`,
    ["-p", "Reply with exactly: HO-S1-OK", ...common],
    baseEnv,
    volume,
  );
  process.stdout.write(
    `first run: ${summary(first)}\n  text: ${JSON.stringify(first.result?.result ?? first.raw.slice(0, 400))}\n`,
  );

  if (first.result?.session_id !== undefined && !first.result.is_error) {
    const second = await runClaude(
      `ho-spike-s1-b`,
      [
        "-p",
        "What exact text did you reply with before? Answer with that text only.",
        "--resume",
        first.result.session_id,
        ...common,
      ],
      baseEnv,
      volume,
    );
    process.stdout.write(
      `resume run: ${summary(second)}\n  text: ${JSON.stringify(second.result?.result ?? second.raw.slice(0, 400))}\n`,
    );
  }

  const bare = await runClaude(
    `ho-spike-s1-c`,
    ["--bare", "-p", "Reply with exactly: HO-S1-BARE", ...common],
    baseEnv,
    volume,
  );
  process.stdout.write(
    `bare run (expected to fail auth): exit=${String(bare.exit)} subtype=${bare.result?.subtype ?? "-"} text=${JSON.stringify((bare.result?.result ?? bare.raw).slice(0, 300))}\n`,
  );
} finally {
  await docker("DELETE", `/volumes/${volume}`).catch(() => null);
}
