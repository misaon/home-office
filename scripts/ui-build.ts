import type { BunPlugin } from "bun";
import { existsSync, renameSync, watch as fsWatch } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const outdir = Bun.env["HO_UI_OUTDIR"] ?? resolve(root, "packages/ui/dist");
const watch = Bun.argv.includes("--watch");

/**
 * The office editor is an internal tool. `NODE_ENV` alone only makes its branch unreachable — the
 * bundler still carries the component — so a production build resolves the module to a stub and the
 * editor's code never enters the graph. Verified by grepping the bundle, not by trusting tree shaking.
 */
const withoutEditor: BunPlugin = {
  name: "ho-drop-editor",
  setup(bundler) {
    bundler.onResolve({ filter: /editor\/overlay\.tsx$/u }, () => ({
      path: "ho-editor-omitted",
      namespace: "ho-omitted",
    }));
    bundler.onLoad({ filter: /.*/u, namespace: "ho-omitted" }, () => ({
      contents: "export const EditorOverlay = (): null => null;\n",
      loader: "ts",
    }));
  },
};

/**
 * Tailwind compiles the office's one stylesheet. The bundler hands the file to the CLI rather than
 * reading it, so nothing generated is ever written into the source tree, and the CLI's own scanner
 * decides what ships: only the utilities the components actually name.
 */
const tailwindCli = resolve(
  Bun.resolveSync("@tailwindcss/cli/package.json", resolve(root, "packages/ui")),
  "../dist/index.mjs",
);

const fontsDir = resolve(root, "packages/ui/src/design/fonts");

/** The `@font-face` rules, lifted out of the bundle; filled by `liftFonts`, written out by `build`. */
const fonts = { css: "", files: new Map<string, string>() };

/**
 * Bun's CSS bundler inlines every `url()` it can resolve as a `data:` URI, with no way to turn it off
 * (oven-sh/bun#28307, open since March 2026). Measured on this stylesheet: Tailwind emits 74 112 bytes
 * and the bundle shipped 607 802 — the vendored subsets base64'd into it, every byte of that parsed
 * before the first paint and none of it cacheable on its own.
 *
 * So the `@font-face` rules never reach the bundler. They leave here as their own stylesheet, pointing
 * at the files under a content hash, and `index.html` links it. `unicode-range` then does what it is
 * for: an office writing Czech and English never fetches the Cyrillic, Greek or Vietnamese subsets.
 */
async function liftFonts(css: string): Promise<string> {
  const present = await readdir(fontsDir).catch(() => []);
  for (const name of present.filter((n) => n.endsWith(".woff2"))) {
    const bytes = await Bun.file(resolve(fontsDir, name)).arrayBuffer();
    const hash = Bun.hash(bytes).toString(36).slice(0, 8);
    fonts.files.set(name, name.replace(/\.woff2$/u, `-${hash}.woff2`));
  }
  const lifted: string[] = [];
  const rest = css.replaceAll(/@font-face\s*\{[^}]*\}/gu, (face) => {
    // Minified Tailwind writes `url(./fonts/x.woff2)`; the watch build quotes it.
    lifted.push(
      face.replaceAll(
        /url\(\s*["']?\.\/fonts\/(?<file>[^"')\s]+)["']?\s*\)/gu,
        (whole, file: string) => {
          const hashed = fonts.files.get(file);
          return hashed === undefined ? whole : `url("fonts/${hashed}")`;
        },
      ),
    );
    return "";
  });
  fonts.css = lifted.join("\n");
  return rest;
}

const tailwind: BunPlugin = {
  name: "ho-tailwind",
  setup(bundler) {
    bundler.onLoad({ filter: /packages\/ui\/src\/design\/app\.css$/u }, async (args) => {
      const out = resolve(root, "packages/ui/.tailwind.css");
      const cli = Bun.spawn(
        ["bun", tailwindCli, "-i", args.path, "-o", out, ...(watch ? [] : ["--minify"])],
        { cwd: root, stdout: "pipe", stderr: "pipe" },
      );
      const code = await cli.exited;
      if (code !== 0) {
        throw new Error(`tailwind failed: ${await new Response(cli.stderr).text()}`);
      }
      const contents = await Bun.file(out).text();
      await rm(out, { force: true });
      return { contents: await liftFonts(contents), loader: "css" };
    });
  },
};

async function build(): Promise<void> {
  const staging = await mkdtemp(resolve(root, "packages/ui/.build-"));
  const previous = `${staging}-previous`;
  try {
    const result = await Bun.build({
      entrypoints: [resolve(root, "packages/ui/index.html")],
      outdir: staging,
      target: "browser",
      minify: !watch,
      sourcemap: watch ? "inline" : "none",
      reactCompiler: true,
      naming: { asset: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]", entry: "[name].[ext]" },
      // Fonts ship as files, not as data URIs. Inlined, the eleven vendored subsets were base64'd once
      // per `@font-face` that referenced them — 27 copies, 326 KiB of them pure duplication — and every
      // byte blocked the first paint. As files each ships once, `unicode-range` means a Latin UI never
      // fetches the Cyrillic or Greek subsets at all, and the browser caches them apart from the CSS.
      loader: { ".woff2": "file" },
      plugins: watch ? [tailwind] : [tailwind, withoutEditor],
      define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
    });
    if (!result.success) {
      throw new AggregateError(result.logs, "UI build failed");
    }
    for (const [name, hashed] of fonts.files) {
      await Bun.write(resolve(staging, "fonts", hashed), Bun.file(resolve(fontsDir, name)));
    }
    // The faces the bundler never saw, and the one line of HTML that asks for them.
    const fontsName = `fonts-${Bun.hash(fonts.css).toString(36).slice(0, 8)}.css`;
    await Bun.write(resolve(staging, fontsName), fonts.css);
    const indexPath = resolve(staging, "index.html");
    const index = await Bun.file(indexPath).text();
    await Bun.write(
      indexPath,
      index.replace("</head>", `<link rel="stylesheet" href="./${fontsName}"></head>`),
    );
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
      rm(previous, { recursive: true, force: true }),
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
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      });
    }, 150);
  };
  const watched = [
    "packages/ui/src",
    "packages/ui/index.html",
    "packages/sim/src",
    "packages/core/src",
    "packages/protocol/src",
  ];
  for (const path of watched) {
    fsWatch(resolve(root, path), { recursive: true }, rebuild);
  }
  process.stdout.write(`watching ${watched.join(", ")}\n`);
}
