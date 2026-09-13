import { contract, errorMessage, RPC_ERROR_CODE } from "@ho/protocol";
import { implement, ORPCError } from "@orpc/server";
import { DomainFailure } from "../domain-failure.ts";
import type { RpcContext } from "./context.ts";

/** Translates a rejected office command into the typed RPC error the contract declares for its code. */
export const guarded = implement(contract)
  .$context<RpcContext>()
  .middleware(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof DomainFailure) {
        const { code, ...data } = error.error;
        throw new ORPCError(RPC_ERROR_CODE[code], { message: error.message, data });
      }
      if (error instanceof ORPCError) {
        throw error;
      }
      // The only clients are local and authenticated, and the daemon logs this too: say what went wrong.
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: errorMessage(error) });
    }
  });
