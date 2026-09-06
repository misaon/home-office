import { resolve, sep } from "node:path";

/** Serves files below `root` without ever leaving it; the SPA entry is served for unknown paths. */
export async function serveStatic(
  root: string,
  pathname: string,
  fallback: string | null,
): Promise<Response> {
  const decoded = decodeURIComponent(pathname).replaceAll("\\", "/");
  const base = resolve(root);
  const target = resolve(base, `.${decoded}`);
  if (target !== base && !target.startsWith(base + sep)) {
    return new Response("forbidden", { status: 403 });
  }
  const file = Bun.file(target);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        "cache-control": decoded.includes("-") ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  }
  if (fallback !== null) {
    const entry = Bun.file(resolve(base, fallback));
    if (await entry.exists()) {
      return new Response(entry, { headers: { "cache-control": "no-cache" } });
    }
  }
  return new Response("not found", { status: 404 });
}
