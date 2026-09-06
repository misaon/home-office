// Bundles the office UI (React 19 with the React Compiler, Tailwind 4) into packages/ui/dist.
// The daemon serves that directory at `/`; Electrobun copies it into the app bundle.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import tailwind from "bun-plugin-tailwind";

const root = resolve(import.meta.dir, "..");
const outdir = resolve(root, "packages/ui/dist");
const watch = Bun.argv.includes("--watch");

async function build(): Promise<void> {
  rmSync(outdir, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [resolve(root, "packages/ui/index.html")],
    outdir,
    target: "browser",
    minify: !watch,
    sourcemap: watch ? "inline" : "none",
    reactCompiler: true,
    naming: { asset: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]", entry: "[name].[ext]" },
    plugins: [tailwind],
    define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  });
  const total = result.outputs.reduce((sum, o) => sum + o.size, 0);
  process.stdout.write(
    `ui: ${String(result.outputs.length)} files, ${(total / 1024).toFixed(0)} KiB → ${outdir}\n`,
  );
}

await build();
if (watch) {
  const { watch: fsWatch } = await import("node:fs");
  let timer: ReturnType<typeof setTimeout> | null = null;
  fsWatch(resolve(root, "packages/ui/src"), { recursive: true }, () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      build().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      });
    }, 150);
  });
  process.stdout.write("watching packages/ui/src\n");
  await new Promise<never>(() => {
    // keep watching
  });
}
