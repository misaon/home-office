# Security policy

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting:

- Go to the [Security tab](https://github.com/misaon/home-office/security) and choose
  **Report a vulnerability**.

That opens a private advisory visible only to you and the maintainers. Expect a first reply within a
week. If a report turns out to be valid, you will be credited in the advisory unless you ask otherwise.

## What is in scope

Home Office runs AI coding agents against your repositories, so the interesting boundaries are:

- **Sandbox escape** — anything that lets an agent reach the host, another task's volume, or another
  floor's repository from inside its container.
- **Secret exposure** — a credential reaching an image, a container's configuration or labels, a log
  line, an event in the store, or a subprocess argument. Secrets are supposed to reach the provider
  process and nothing else.
- **Command injection** — agent output becoming a shell command in the daemon, or a repository path or
  branch name escaping its argv.
- **The office's own network surface** — the daemon's loopback RPC, its launch token, and the office UI
  it serves.

## What is not

- The agent images bundle third-party CLIs (Claude Code, OpenCode, Gemini CLI, Codex) and Chromium.
  Vulnerabilities in those belong to their own projects; tell us anyway if Home Office makes one worse.
- The desktop application is signed ad-hoc, not with an Apple Developer ID, and macOS says so on first
  launch. That is a known and documented property of the build, not a vulnerability.
- Anything that requires the attacker to already control your machine.

## Supported versions

The latest release. This project is early; there are no maintenance branches yet.
