import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "ho-spike-s2",
    identifier: "spike-s2.home-office.local",
    version: "0.0.1",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
    mac: {
      bundleCEF: false,
      codesign: false,
      notarize: false,
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
} satisfies ElectrobunConfig;
