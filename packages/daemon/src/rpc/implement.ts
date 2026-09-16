import { contract } from "@ho/protocol";
import { implement } from "@orpc/server";
import type { RpcContext } from "./context.ts";

export const os = implement(contract).$context<RpcContext>();
