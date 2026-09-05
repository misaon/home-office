# syntax=docker/dockerfile:1
# Home Office agent image: Alpine + Claude Code (official apk repo) + git, non-root user.
# Spike S1 version; RTK, ho-runner and role plugins are added in Phase 2.
FROM alpine:3.22

RUN apk add --no-cache bash curl ca-certificates libgcc libstdc++ ripgrep git openssh-client \
 && wget -qO /etc/apk/keys/claude-code.rsa.pub https://downloads.claude.ai/keys/claude-code.rsa.pub \
 && echo "395759c1f7449ef4cdef305a42e820f3c766d6090d142634ebdb049f113168b6  /etc/apk/keys/claude-code.rsa.pub" | sha256sum -c - \
 && echo "https://downloads.claude.ai/claude-code/apk/stable" >> /etc/apk/repositories \
 && apk add --no-cache claude-code \
 && adduser -D -u 1000 agent \
 && mkdir -p /work \
 && chown agent:agent /work

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

CMD ["claude", "--version"]
