import { errorMessage } from "@ho/protocol";
import { existsSync, renameSync, watch as fsWatch } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import tailwind from "bun-plugin-tailwind";

const root = resolve(import.meta.dir, "..");
const outdir = resolve(root, "packages/ui/dist");
const watch = Bun.argv.includes("--watch");

async function build(): Promise<void> {
  const staging = await mkdtemp(resolve(root, "packages/ui/.build-"));
  const previous = `${staging}-previous`;
  let published = false;
  try {
    const result = await Bun.build({
      entrypoints: [resolve(root, "packages/ui/index.html")],
      outdir: staging,
      target: "browser",
      minify: !watch,
      sourcemap: watch ? "inline" : "none",
      reactCompiler: true,
      naming: { asset: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]", entry: "[name].[ext]" },
      plugins: [tailwind],
      define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
    });
    if (!result.success) {
      throw new AggregateError(result.logs, "UI build failed");
    }
    if (watch) {
      await Bun.write(resolve(staging, "dev-revision.txt"), `${String(Date.now())}\n`);
    }
    const total = result.outputs.reduce((sum, output) => sum + output.size, 0);
    const hadPrevious = existsSync(outdir);
    if (hadPrevious) {
      renameSync(outdir, previous);
    }
    try {
      renameSync(staging, outdir);
      published = true;
    } catch (error) {
      if (hadPrevious) {
        renameSync(previous, outdir);
      }
      throw error;
    }
    process.stdout.write(
      `ui: ${String(result.outputs.length)} files, ${(total / 1024).toFixed(0)} KiB → ${outdir}\n`,
    );
  } finally {
    await Promise.all([
      rm(staging, { recursive: true, force: true }),
      published ? rm(previous, { recursive: true, force: true }) : Promise.resolve(),
    ]);
  }
}

await build();
if (watch) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = Promise.resolve();
  const rebuild = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      pending = pending.then(build).catch((error: unknown) => {
        process.stderr.write(`${errorMessage(error)}\n`);
      });
    }, 150);
  };
  await mkdir(resolve(root, "assets/dist"), { recursive: true });
  const watched = [
    "packages/ui/src",
    "packages/ui/index.html",
    "packages/sim/src",
    "packages/core/src",
    "packages/protocol/src",
    "assets/dist",
  ];
  for (const path of watched) {
    fsWatch(resolve(root, path), { recursive: true }, rebuild);
  }
  process.stdout.write(`watching ${watched.join(", ")}\n`);
}
