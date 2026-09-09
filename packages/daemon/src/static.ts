import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

/**
 * The bundle's file names carry a content hash, so they can be cached forever. Everything else — the
 * HTML entry above all — must not be cached at all: a stale `index.html` points at a bundle that is no
 * longer there, which is how a rebuilt UI can keep serving the previous one.
 */
const IMMUTABLE = "public, max-age=31536000, immutable";
const NEVER = "no-store";
const HASHED = /-[a-z\d]{6,}\.(?:js|css)$/u;

const headers = (cache: string): Record<string, string> => ({
  ...HEADERS,
  "cache-control": cache,
});

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
  const fileResponse = async (path: string, cache: string): Promise<Response | null> => {
    const actual = await realpath(path).catch(() => null);
    if (actual === null) {
      return null;
    }
    if (!within(actual)) {
      return new Response("forbidden", { status: 403 });
    }
    return (await stat(actual)).isFile()
      ? new Response(Bun.file(actual), { headers: headers(cache) })
      : null;
  };
  return (
    (await fileResponse(target, HASHED.test(decoded) ? IMMUTABLE : NEVER)) ??
    (fallback === null ? null : await fileResponse(resolve(base, fallback), NEVER)) ??
    new Response("not found", { status: 404 })
  );
}
