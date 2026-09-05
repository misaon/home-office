import type { RPCSchema } from "electrobun/main";

export type Report = {
  renderer: string;
  sprites: number;
  fps: number;
  wsRoundTripMs: number;
  userAgent: string;
};

export type SpikeRPC = {
  bun: RPCSchema<{
    requests: {
      getGatewayInfo: { params: Record<string, never>; response: { url: string } };
    };
    messages: {
      report: Report;
      log: { text: string };
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: Record<string, never>;
  }>;
};
