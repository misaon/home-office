export const bearerToken = (req: Request): string | null => {
  const header = req.headers.get("authorization");
  return header?.startsWith("Bearer ") === true ? header.slice("Bearer ".length) : null;
};

export const mintToken = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
