import { contract, errorMessage, RPC_ERROR_CODE } from "@ho/protocol";
import { implement, ORPCError } from "@orpc/server";
import { DomainFailureError } from "../domain-failure.ts";
import type { RpcContext } from "./context.ts";

export const guarded = implement(contract)
  .$context<RpcContext>()
  .middleware(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof DomainFailureError) {
        const { code, ...data } = error.error;
        throw new ORPCError(RPC_ERROR_CODE[code], { message: error.message, data });
      }
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: errorMessage(error) });
    }
  });
