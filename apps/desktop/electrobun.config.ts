import type { ElectrobunConfig } from "electrobun";

/**
 * Home Office desktop shell. The Bun main process runs @ho/daemon in-process; the window loads the office
 * UI the daemon serves. `resources/ho` (written by `bun run desktop:prepare`, git-ignored) mirrors the
 * repository paths the daemon needs: image build contexts, the UI bundle, sprites and migrations.
 */
export default {
  app: {
    name: "Home Office",
    identifier: "cz.ondrejmisak.home-office",
    version: "0.1.0",
    description:
      "A pixel-art office of AI coding agents working in sandboxes on your repositories.",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      "resources/ho": "ho",
    },
    mac: {
      bundleCEF: false,
      codesign: false,
      notarize: false,
      icons: "icon.iconset",
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
  runtime: {
    // The main process quits itself after the daemon stopped (see src/bun/index.ts).
    exitOnLastWindowClosed: false,
  },
  release: {
    baseUrl: "https://github.com/misaon/home-office/releases/latest/download",
    generatePatch: false,
  },
} satisfies ElectrobunConfig;
