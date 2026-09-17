import { contract, errorMessage, REMOTE_ALLOWED_ROUTES, RPC_ERROR_CODE } from "@ho/protocol";
import { implement, ORPCError } from "@orpc/server";
import { DomainFailureError } from "../domain-failure.ts";
import type { RpcContext } from "./context.ts";

export const guarded = implement(contract)
  .$context<RpcContext>()
  .middleware(async ({ next, path, context }) => {
    const started = Bun.nanoseconds();
    const route = path.join(".");
    const { device } = context;
    let failure: string | null = null;
    try {
      if (device !== undefined && !REMOTE_ALLOWED_ROUTES.has(route)) {
        throw new ORPCError("FORBIDDEN", {
          message: `${route} is not available to a remote device`,
        });
      }
      return await next();
    } catch (error) {
      failure = errorMessage(error);
      if (error instanceof DomainFailureError) {
        const { code, ...data } = error.error;
        throw new ORPCError(RPC_ERROR_CODE[code], { message: error.message, data });
      }
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: errorMessage(error) });
    } finally {
      const fields = {
        route,
        ms: Math.round((Bun.nanoseconds() - started) / 1e6),
        ...(failure === null ? {} : { err: failure }),
      };
      if (device === undefined) {
        context.log.debug(fields, "rpc call");
      } else {
        context.log.info({ ...fields, device: device.id }, "remote rpc call");
      }
    }
  });
