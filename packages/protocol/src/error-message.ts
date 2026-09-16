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

const DomainDetail = z.union([
  z.object({ reason: z.string() }),
  z.object({ entity: z.string(), id: z.string() }),
  z.object({ from: z.string(), to: z.string() }),
]);

const detailLine = (detail: z.infer<typeof DomainDetail>): string => {
  if ("reason" in detail) {
    return detail.reason;
  }
  if ("entity" in detail) {
    return `no such ${detail.entity}: ${detail.id}`;
  }
  return `cannot move from ${detail.from} to ${detail.to}`;
};

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
    const detail = DomainDetail.safeParse(error.data);
    if (detail.success) {
      return detailLine(detail.data);
    }
  }
  return error instanceof Error ? error.message : String(error);
};

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
