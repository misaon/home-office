import { contract } from "@ho/protocol";
import { implement } from "@orpc/server";
import type { RpcContext } from "./context.ts";

/** The one implementer every route module builds on, so the router and its parts share a context. */
export const os = implement(contract).$context<RpcContext>();
