export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
