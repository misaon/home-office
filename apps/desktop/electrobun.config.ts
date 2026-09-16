import type { ElectrobunConfig } from "electrobun";

const version = Bun.env["HO_RELEASE_VERSION"] ?? "0.0.0";
if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)) {
  throw new Error("HO_RELEASE_VERSION must be a stable semantic version");
}

export default {
  app: {
    name: "Home Office",
    identifier: "cz.ondrejmisak.home-office",
    version,
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
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
} satisfies ElectrobunConfig;
