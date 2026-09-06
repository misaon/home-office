// Hutch drives Electrobun; the Bun workspace install at the repository root provides node_modules.
export default {
  packageManager: "bun",
  scripts: {
    dev: ["hutch", "electrobun", "dev"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
  electrobun: {
    version: "2.0.1",
  },
};
