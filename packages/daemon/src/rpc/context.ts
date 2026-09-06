import type { Office } from "../office.ts";

export type RpcContext = {
  office: Office;
  version: string;
  startedAt: string;
};
