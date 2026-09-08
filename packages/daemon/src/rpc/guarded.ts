import { contract, errorMessage } from "@ho/protocol";
import { implement, ORPCError } from "@orpc/server";
import { DomainFailure } from "../errors.ts";
import type { RpcContext } from "./context.ts";

/** Runs an office command and translates domain failures into typed RPC errors. */
export const guarded = implement(contract)
  .$context<RpcContext>()
  .middleware(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof DomainFailure) {
        switch (error.error.code) {
          case "not_found": {
            throw new ORPCError("NOT_FOUND", {
              message: error.message,
              data: { entity: error.error.entity, id: error.error.id },
            });
          }
          case "conflict": {
            throw new ORPCError("CONFLICT", {
              message: error.message,
              data: { reason: error.error.reason },
            });
          }
          case "invalid_transition": {
            throw new ORPCError("INVALID_TRANSITION", {
              message: error.message,
              data: { from: error.error.from, to: error.error.to },
            });
          }
        }
      }
      if (error instanceof ORPCError) {
        throw error;
      }
      // The only clients are local and authenticated, and the daemon logs this too: say what went wrong.
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: errorMessage(error) });
    }
  });
