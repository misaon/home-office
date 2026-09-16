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

The desktop command prepares the UI and runner, installs a checksum-pinned Hutch toolchain in
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
bun run apps/cli/src/main.ts daemon --ui
```

In another terminal, `bun run apps/cli/src/main.ts ui` opens the browser UI. For a standalone CLI,
run `bun run cli:build` and use the binary it writes to `apps/cli/dist/ho` —
it carries no office UI bundle and no Docker build contexts, so `ho ui` and `ho image build` say so
instead of failing obscurely, and `ho doctor` reports images as not inspectable. Run the daemon from a
source checkout, or use the desktop app, when you want those.
`bun run ui:watch` rebuilds and reloads an open development UI. `bun run setup` installs the local git hook.
State defaults to `~/.config/home-office`; `HO_HOME` selects a separate state directory.

A floor can also describe itself from inside its own repository. `.ho/config.json` states the floor's
name, default branch, publish/intake/services policy, budgets and staff; the office applies it when the
daemon starts, when the file changes and on `ho project sync <floor> [--dry-run]`, and
`ho project export <floor>` writes the floor as it stands back into the file. Credentials are never in
it — only `provider` and `auth`, which is enough for the daemon to find the key in the credential store.
`.ho/config.local.json` beside it is gitignored and layers over the committed file for one machine. See
[the architecture](docs/ARCHITECTURE.md#floor-configuration-in-the-repository) and
[schema/office.schema.json](schema/office.schema.json).

Secrets live in this machine's credential store — Keychain on macOS, libsecret on Linux, Credential
Manager on Windows — and fall back to a mode-0600 JSON file in the state directory when the host has
none; `secrets.store` in `config.json` (`auto`, `os` or `file`) overrides that choice.

## Documentation

- [Current architecture and limitations](docs/ARCHITECTURE.md)
- [Stack choices and framework assessment](docs/STACK.md)
- [Current plan and remaining work](docs/PLAN.md)
- [Engineering conventions](docs/CONVENTIONS.md)
- [The September 2026 deep audit](audit/AUDIT.md) — findings, coverage matrix, verification transcripts
  and seven ADRs; [an earlier audit report](docs/history/AUDIT-2026-09.md) is kept as history
