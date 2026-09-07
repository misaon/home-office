import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const HEADERS = {
  "cache-control": "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

export async function serveStatic(
  root: string,
  pathname: string,
  fallback: string | null,
): Promise<Response> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname).replaceAll("\\", "/");
  } catch {
    return new Response("bad path", { status: 400 });
  }
  if (decoded.includes("\0")) {
    return new Response("bad path", { status: 400 });
  }
  const base = await realpath(root).catch(() => null);
  if (base === null) {
    return new Response("not found", { status: 404 });
  }
  const within = (path: string): boolean => path === base || path.startsWith(base + sep);
  const target = resolve(base, `.${decoded}`);
  if (!within(target)) {
    return new Response("forbidden", { status: 403 });
  }
  const fileResponse = async (path: string): Promise<Response | null> => {
    const actual = await realpath(path).catch(() => null);
    if (actual === null) {
      return null;
    }
    if (!within(actual)) {
      return new Response("forbidden", { status: 403 });
    }
    return (await stat(actual)).isFile()
      ? new Response(Bun.file(actual), { headers: HEADERS })
      : null;
  };
  return (
    (await fileResponse(target)) ??
    (fallback === null ? null : await fileResponse(resolve(base, fallback))) ??
    new Response("not found", { status: 404 })
  );
}
