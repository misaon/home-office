// Serves the layout preview and public art only; never starts the daemon or a model session.
import { resolve } from "node:path";
import { watch } from "node:fs";
import { $ } from "bun";
import { serveStatic } from "../packages/daemon/src/static.ts";

const root = resolve(import.meta.dir, "..");
await $`bun run ui:build`.cwd(root);
await $`bun run assets:manifest`.cwd(root);
let revision = Date.now();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 47810,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405 });
    }
    if (pathname === "/") {
      return Response.redirect("/office-lab", 302);
    }
    if (pathname === "/__office_lab_revision") {
      return new Response(`office-lab:${String(revision)}`, {
        headers: { "cache-control": "no-store" },
      });
    }
    let response: Response;
    if (pathname.startsWith("/assets/")) {
      response = await serveStatic(resolve(root, "assets"), pathname.slice("/assets".length), null);
    } else {
      response = await serveStatic(resolve(root, "packages/ui/dist"), pathname, "index.html");
    }
    response.headers.set("cache-control", "no-store");
    return response;
  },
});
process.stdout.write(`Office Lab: http://127.0.0.1:${String(server.port)}/office-lab\n`);

let pending = false;
let building = false;
let timer: ReturnType<typeof setTimeout> | undefined;
async function rebuild(): Promise<void> {
  pending = true;
  if (building) {
    return;
  }
  building = true;
  try {
    while (pending) {
      pending = false;
      await $`bun run ui:build`.cwd(root);
      await $`bun run assets:manifest`.cwd(root);
      revision += 1;
      process.stdout.write("Office Lab updated\n");
    }
  } catch (error) {
    process.stderr.write(
      `Office Lab build failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  } finally {
    building = false;
  }
}
const scheduleBuild = (): void => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void rebuild();
  }, 200);
};
for (const path of ["packages/ui/src", "packages/sim/src", "assets/src"]) {
  watch(resolve(root, path), { recursive: true }, scheduleBuild);
}
