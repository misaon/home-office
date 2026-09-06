# syntax=docker/dockerfile:1
# Home Office agent image: Alpine + Claude Code (official apk repo, latest channel) + git + RTK + ho-runner + role skill packs.
# The build context must contain bin/ho-runner and plugins/ (synced by the daemon / `ho image build`).

# --- RTK (Rust Token Killer) compiled for aarch64-musl; upstream ships no musl arm64 binary. ---
FROM rust:1-alpine AS rtk
RUN apk add --no-cache musl-dev git \
 && cargo install --git https://github.com/rtk-ai/rtk --tag v0.48.0 --locked --root /out rtk

# --- runtime ---
FROM alpine:3.22

RUN apk add --no-cache bash curl ca-certificates libgcc libstdc++ ripgrep git openssh-client \
 && wget -qO /etc/apk/keys/claude-code.rsa.pub https://downloads.claude.ai/keys/claude-code.rsa.pub \
 && echo "395759c1f7449ef4cdef305a42e820f3c766d6090d142634ebdb049f113168b6  /etc/apk/keys/claude-code.rsa.pub" | sha256sum -c - \
 && echo "https://downloads.claude.ai/claude-code/apk/latest" >> /etc/apk/repositories \
 && apk add --no-cache claude-code \
 && adduser -D -u 1000 agent \
 && mkdir -p /work /home/agent/.claude /home/agent/.config/rtk /opt/ho/plugins \
 && chown -R agent:agent /work /home/agent

COPY --from=rtk /out/bin/rtk /usr/local/bin/rtk
COPY --chmod=0755 bin/ho-runner /usr/local/bin/ho-runner
COPY plugins/ /opt/ho/plugins/
COPY --chown=agent:agent rtk-config.toml /home/agent/.config/rtk/config.toml

USER agent
WORKDIR /work
ENV HOME=/home/agent \
    CLAUDE_CONFIG_DIR=/home/agent/.claude \
    USE_BUILTIN_RIPGREP=0 \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_TELEMETRY=1 \
    DISABLE_ERROR_REPORTING=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    ENABLE_CLAUDEAI_MCP_SERVERS=false

CMD ["/usr/local/bin/ho-runner"]
