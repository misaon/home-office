# syntax=docker/dockerfile:1
FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS base
ARG TARGETARCH
ARG BUN_VERSION=1.4.2
ARG BUN_SHA256_ARM64=71760b6c8ea30623b81a4907cb815d48e2ea266f2e73e751534a44a0607950df
ARG BUN_SHA256_AMD64=4835eca59d6da70f4674f5642f6e459dcadab773695b2ed9922d131057989742
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
    { [ "$TARGETARCH" = arm64 ] || [ "$TARGETARCH" = amd64 ]; } \
      || { echo "the agent image builds for arm64 and amd64, not $TARGETARCH" >&2; exit 1; } \
 && ln -sf /var/cache/apk /etc/apk/cache \
 && apk upgrade \
 && apk add bash curl ca-certificates libgcc libstdc++ ripgrep git openssh-client \
      chromium nodejs npm python3 py3-pip ttf-dejavu ttf-liberation unzip \
      coreutils diffutils findutils gawk grep sed jq build-base tzdata \
      docker-cli docker-cli-compose docker-cli-buildx \
 && adduser -D -u 1000 agent \
 && mkdir -p /work /home/agent/.cache /opt/ho/plugins /opt/ho/mcp \
 && chown -R agent:agent /work /home/agent
RUN if [ "$TARGETARCH" = arm64 ]; then \
      build=bun-linux-aarch64-musl; sum="$BUN_SHA256_ARM64"; \
    else \
      build=bun-linux-x64-musl; sum="$BUN_SHA256_AMD64"; \
    fi \
 && wget -qO /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${build}.zip" \
 && echo "${sum}  /tmp/bun.zip" | sha256sum -c - \
 && unzip -q /tmp/bun.zip -d /tmp/bun \
 && install -m 0755 "/tmp/bun/${build}/bun" /usr/local/bin/bun \
 && ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -r /tmp/bun /tmp/bun.zip \
 && apk del unzip
COPY mcp/package*.json /opt/ho/mcp/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    cd /opt/ho/mcp \
 && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1 npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && test -f node_modules/@playwright/mcp/cli.js \
 && test -f node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js
COPY --chmod=0644 bin/ho-runner.js /usr/local/bin/ho-runner.js
COPY plugins/ /opt/ho/plugins/
ENV HOME=/home/agent \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    CHROME_PATH=/usr/lib/chromium/chromium \
    DO_NOT_TRACK=1 \
    XDG_CACHE_HOME=/work/.cache \
    npm_config_cache=/work/.cache/npm \
    BUN_INSTALL_CACHE_DIR=/work/.cache/bun \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 \
    PIP_CACHE_DIR=/work/.cache/pip \
    GIT_CONFIG_GLOBAL=/tmp/gitconfig \
    PATH=/opt/ho/provider/node_modules/.bin:$PATH
WORKDIR /work
CMD ["bun", "/usr/local/bin/ho-runner.js"]

FROM base AS claude-code
ARG CLAUDE_CODE_VERSION=2.1.272-r1
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
    wget -qO /etc/apk/keys/claude-code.rsa.pub https://downloads.claude.ai/keys/claude-code.rsa.pub \
 && echo "395759c1f7449ef4cdef305a42e820f3c766d6090d142634ebdb049f113168b6  /etc/apk/keys/claude-code.rsa.pub" | sha256sum -c - \
 && echo "https://downloads.claude.ai/claude-code/apk/latest" >> /etc/apk/repositories \
 && ln -sf /var/cache/apk /etc/apk/cache \
 && apk upgrade \
 && apk add "claude-code=${CLAUDE_CODE_VERSION}" \
 && mkdir -p /home/agent/.claude && chown agent:agent /home/agent/.claude
USER agent
ENV CLAUDE_CONFIG_DIR=/home/agent/.claude \
    USE_BUILTIN_RIPGREP=0 \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_TELEMETRY=1 \
    DISABLE_ERROR_REPORTING=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1 \
    ENABLE_CLAUDEAI_MCP_SERVERS=false

FROM base AS opencode
COPY providers/opencode/package*.json /opt/ho/provider/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    cd /opt/ho/provider \
 && npm ci --omit=dev --no-audit --no-fund \
 && mkdir -p /home/agent/.local/share/opencode /home/agent/.config/opencode \
 && chown -R agent:agent /home/agent/.local /home/agent/.config/opencode
USER agent
RUN opencode --version

FROM base AS gemini-cli
COPY providers/gemini-cli/package*.json /opt/ho/provider/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    cd /opt/ho/provider \
 && npm ci --omit=dev --no-audit --no-fund \
 && mkdir -p /home/agent/.gemini && chown -R agent:agent /home/agent/.gemini
USER agent
ENV GEMINI_CLI_NO_RELAUNCH=true
RUN gemini --version

FROM base AS codex
COPY providers/codex/package*.json /opt/ho/provider/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    cd /opt/ho/provider \
 && npm ci --omit=dev --no-audit --no-fund \
 && mkdir -p /home/agent/.codex && chown -R agent:agent /home/agent/.codex
USER agent
RUN codex-acp --version && codex --version
