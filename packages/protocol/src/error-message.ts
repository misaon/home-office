import { ORPCError } from "@orpc/contract";
import { prettifyError, z, ZodError } from "zod";

const WireIssues = z.object({
  issues: z
    .array(
      z.object({
        message: z.string(),
        path: z.array(z.union([z.string(), z.number()])).optional(),
      }),
    )
    .min(1),
});

type WireIssue = z.infer<typeof WireIssues>["issues"][number];

const issueLine = ({ message, path }: WireIssue): string =>
  path === undefined || path.length === 0 ? message : `${path.join(".")}: ${message}`;

const CAUSE_DEPTH = 4;

const describe = (error: unknown): string => {
  if (error instanceof ZodError) {
    return prettifyError(error).replaceAll("✖ ", "");
  }
  if (error instanceof ORPCError) {
    const wire = WireIssues.safeParse(error.data);
    if (wire.success) {
      return wire.data.issues.map(issueLine).join("\n");
    }
  }
  return error instanceof Error ? error.message : String(error);
};

/**
 * A ZodError's own `message` is the JSON issue array and an oRPC validation failure says only "Input
 * validation failed", so both are rendered from their issues instead. Causes are appended because the
 * diagnosis usually lives there: a wrapper explains what failed, its cause explains why.
 */
export const errorMessage = (error: unknown): string => {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth <= CAUSE_DEPTH; depth += 1) {
    const text = describe(current);
    if (text !== "" && parts.at(-1) !== text) {
      parts.push(text);
    }
    if (!(current instanceof Error) || current.cause === undefined) {
      break;
    }
    current = current.cause;
  }
  return parts.join("\n  caused by: ");
};

export const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
