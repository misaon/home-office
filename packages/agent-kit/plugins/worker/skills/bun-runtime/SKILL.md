---
name: bun-runtime
description: Use the project Bun version and verify runtime, bundler and dependency compatibility.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Bun runtime

Read `packageManager`, `engines`, `bunfig.toml`, workspace manifests and lockfiles before choosing a
command. Use the pinned project toolchain. Bun's TypeScript execution does not replace type checking.

For a frozen workspace install use `bun install --frozen-lockfile`. Preserve catalogs and the configured
linker. Run defined scripts through `bun run`; do not assume `dev`, `build` or `test` scripts exist.

Check the current official documentation when using native APIs, compile targets, lifecycle-script
trust, Node compatibility or bundler plugins. Verify compiled binaries on their target architecture.
Do not claim every Node package or browser build works without validation. Do not bypass lifecycle
script restrictions to make an install pass without understanding the dependency.

Sources: [Bun documentation](https://bun.com/docs),
[installation](https://bun.com/docs/pm/cli/install),
[isolated installs](https://bun.com/docs/pm/isolated-installs).
