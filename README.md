# Home Office

A local multi-agent coding harness with a pixel-art office. Each repository gets a floor, its boss
Andrew and receptionist Lola. Agents work in isolated Docker task volumes, exchange work visibly, and
produce branches or pull requests through the daemon.

The application uses Bun, TypeScript 7, React, PixiJS and Electrobun. Providers include Claude Code,
OpenCode, Gemini CLI and Codex. The supported desktop target is macOS Apple Silicon with Docker Desktop.

## Run the desktop

```sh
bun install --frozen-lockfile
bun run desktop:dev
```

The desktop command prepares the UI, sprites and runner, installs a checksum-pinned Hutch toolchain in
`.tools`, and starts the app. Create a project/floor, then use Setup to check Docker, build required
images and configure provider credentials. Each new floor has a boss; hire more staff in Settings.
Claude subscription users obtain a token with `claude setup-token`. Other providers use their API keys
or supported local model servers. GitHub intake/PR delivery uses the host's `gh auth login`.

`bun run desktop:build` creates an unsigned application and DMG under `apps/desktop/artifacts/`.
Release tags are stable `vX.Y.Z` tags on commits reachable from `main`.

## CLI and development

```sh
bun run devkit
bun run check
bun run ui:build
bun run assets:manifest
bun run apps/cli/src/main.ts daemon --ui
```

In another terminal, `bun run apps/cli/src/main.ts ui` opens the browser UI. For a standalone CLI,
run `bun build --compile --minify apps/cli/src/main.ts --outfile apps/cli/dist/ho` and use that binary.
`bun run ui:watch` rebuilds and reloads an open development UI. `bun run setup` installs the local git hook.
State defaults to `~/.config/home-office`; `HO_HOME` selects a separate state directory.

## Documentation

- [Current architecture and limitations](docs/ARCHITECTURE.md)
- [Stack choices and framework assessment](docs/STACK.md)
- [Current plan and remaining work](docs/PLAN.md)
- [Independent September 2026 audit](docs/audit/2026-09.md)
- [Engineering conventions](docs/CONVENTIONS.md)
- [Sprite import contract](assets/README.md) and [office art](docs/OFFICE-ART.md)
