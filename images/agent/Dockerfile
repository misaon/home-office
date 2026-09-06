# syntax=docker/dockerfile:1
# Home Office agent image: Alpine + Claude Code (official apk repo, latest channel) + git + RTK + ho-runner + role skill packs
# + headless Chromium with the Playwright and Chrome DevTools MCP servers + Bun and Node for frontend work (D15).
# The build context must contain bin/ho-runner and plugins/ (synced by the daemon / `ho image build`).

# --- RTK (Rust Token Killer) compiled for aarch64-musl; upstream ships no musl arm64 binary. ---
FROM rust:1-alpine AS rtk
RUN apk add --no-cache musl-dev git \
 && cargo install --git https://github.com/rtk-ai/rtk --tag v0.48.0 --locked --root /out rtk

# --- runtime ---
FROM alpine:3.22

ARG BUN_VERSION=1.4.2
ARG BUN_SHA256=71760b6c8ea30623b81a4907cb815d48e2ea266f2e73e751534a44a0607950df

RUN apk add --no-cache bash curl ca-certificates libgcc libstdc++ ripgrep git openssh-client \
      chromium nodejs npm ttf-dejavu ttf-liberation unzip \
 && wget -qO /etc/apk/keys/claude-code.rsa.pub https://downloads.claude.ai/keys/claude-code.rsa.pub \
 && echo "395759c1f7449ef4cdef305a42e820f3c766d6090d142634ebdb049f113168b6  /etc/apk/keys/claude-code.rsa.pub" | sha256sum -c - \
 && echo "https://downloads.claude.ai/claude-code/apk/latest" >> /etc/apk/repositories \
 && apk add --no-cache claude-code \
 && adduser -D -u 1000 agent \
 && mkdir -p /work /home/agent/.claude /home/agent/.config/rtk /opt/ho/plugins /opt/ho/mcp \
 && chown -R agent:agent /work /home/agent

# Bun for the agents' own projects (this repository included); official musl arm64 build, hash pinned.
RUN wget -qO /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-aarch64-musl.zip" \
 && echo "${BUN_SHA256}  /tmp/bun.zip" | sha256sum -c - \
 && unzip -q /tmp/bun.zip -d /tmp/bun \
 && install -m 0755 /tmp/bun/bun-linux-aarch64-musl/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -r /tmp/bun /tmp/bun.zip

# Browser MCP servers, pinned in mcp/package.json; they drive the distribution's Chromium, never a downloaded browser.
COPY mcp/package.json /opt/ho/mcp/package.json
RUN cd /opt/ho/mcp \
 && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1 npm install --omit=dev --no-audit --no-fund \
 && rm -r /root/.npm \
 && test -f node_modules/@playwright/mcp/cli.js \
 && test -f node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js

COPY --from=rtk /out/bin/rtk /usr/local/bin/rtk
COPY --chmod=0755 bin/ho-runner /usr/local/bin/ho-runner
COPY plugins/ /opt/ho/plugins/
COPY --chown=agent:agent rtk-config.toml /home/agent/.config/rtk/config.toml

USER agent
WORKDIR /work
# RTK rewrites Bash tool calls to compact equivalents; its hook lives in the user settings that Claude Code reads.
RUN rtk init -g --hook-only --auto-patch >/dev/null && test -s /home/agent/.claude/settings.json
ENV HOME=/home/agent \
    CLAUDE_CONFIG_DIR=/home/agent/.claude \
    USE_BUILTIN_RIPGREP=0 \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_TELEMETRY=1 \
    DISABLE_ERROR_REPORTING=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    ENABLE_CLAUDEAI_MCP_SERVERS=false \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    CHROME_PATH=/usr/lib/chromium/chromium

CMD ["/usr/local/bin/ho-runner"]
