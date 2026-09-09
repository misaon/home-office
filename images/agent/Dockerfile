FROM rust:1-alpine@sha256:a10e64dd139b7387337c7fbe8aca31b959b57b2fd4c8ae20a02cf1d6ea424dce AS rtk
RUN apk add --no-cache musl-dev git \
 && cargo install --git https://github.com/rtk-ai/rtk --rev fde0a8f185945556f51718de0f4c430bb62b3df6 --locked --root /out rtk

FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS base
ARG TARGETARCH
ARG BUN_VERSION=1.4.2
ARG BUN_SHA256=71760b6c8ea30623b81a4907cb815d48e2ea266f2e73e751534a44a0607950df
RUN test "$TARGETARCH" = arm64 \
 && apk add --no-cache bash curl ca-certificates libgcc libstdc++ ripgrep git openssh-client \
      chromium nodejs npm ttf-dejavu ttf-liberation unzip \
      docker-cli docker-cli-compose docker-cli-buildx \
 && adduser -D -u 1000 agent \
 && mkdir -p /work /home/agent/.config/rtk /home/agent/.cache /opt/ho/plugins /opt/ho/mcp \
 && chown -R agent:agent /work /home/agent
RUN wget -qO /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-aarch64-musl.zip" \
 && echo "${BUN_SHA256}  /tmp/bun.zip" | sha256sum -c - \
 && unzip -q /tmp/bun.zip -d /tmp/bun \
 && install -m 0755 /tmp/bun/bun-linux-aarch64-musl/bun /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -r /tmp/bun /tmp/bun.zip \
 && apk del unzip
COPY mcp/package*.json /opt/ho/mcp/
RUN cd /opt/ho/mcp \
 && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1 npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force \
 && test -f node_modules/@playwright/mcp/cli.js \
 && test -f node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js
COPY --from=rtk /out/bin/rtk /usr/local/bin/rtk
COPY --chmod=0644 bin/ho-runner.js /usr/local/bin/ho-runner.js
COPY plugins/ /opt/ho/plugins/
COPY --chown=agent:agent rtk-config.toml /home/agent/.config/rtk/config.toml
ENV HOME=/home/agent \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    CHROME_PATH=/usr/lib/chromium/chromium \
    DO_NOT_TRACK=1 \
    PATH=/opt/ho/provider/node_modules/.bin:$PATH
WORKDIR /work
CMD ["bun", "/usr/local/bin/ho-runner.js"]

FROM base AS claude-code
ARG CLAUDE_CODE_VERSION=2.1.263-r1
RUN wget -qO /etc/apk/keys/claude-code.rsa.pub https://downloads.claude.ai/keys/claude-code.rsa.pub \
 && echo "395759c1f7449ef4cdef305a42e820f3c766d6090d142634ebdb049f113168b6  /etc/apk/keys/claude-code.rsa.pub" | sha256sum -c - \
 && echo "https://downloads.claude.ai/claude-code/apk/latest" >> /etc/apk/repositories \
 && apk add --no-cache "claude-code=${CLAUDE_CODE_VERSION}" \
 && mkdir -p /home/agent/.claude && chown agent:agent /home/agent/.claude
USER agent
RUN rtk init -g --hook-only --auto-patch >/dev/null && test -s /home/agent/.claude/settings.json
ENV CLAUDE_CONFIG_DIR=/home/agent/.claude \
    USE_BUILTIN_RIPGREP=0 \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_TELEMETRY=1 \
    DISABLE_ERROR_REPORTING=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    ENABLE_CLAUDEAI_MCP_SERVERS=false

FROM base AS opencode
COPY providers/opencode/package*.json /opt/ho/provider/
RUN cd /opt/ho/provider \
 && npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force \
 && mkdir -p /home/agent/.local/share/opencode /home/agent/.config/opencode \
 && chown -R agent:agent /home/agent/.local /home/agent/.config/opencode
USER agent
RUN opencode --version

FROM base AS gemini-cli
COPY providers/gemini-cli/package*.json /opt/ho/provider/
RUN cd /opt/ho/provider \
 && npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force \
 && mkdir -p /home/agent/.gemini && chown -R agent:agent /home/agent/.gemini
USER agent
ENV GEMINI_CLI_NO_RELAUNCH=true
RUN gemini --version

FROM base AS codex
COPY providers/codex/package*.json /opt/ho/provider/
RUN cd /opt/ho/provider \
 && npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force \
 && mkdir -p /home/agent/.codex && chown -R agent:agent /home/agent/.codex
USER agent
RUN codex-acp --version && codex --version
