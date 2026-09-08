FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
RUN apk add --no-cache git openssh-client ca-certificates \
 && adduser -D -u 1000 bridge \
 && mkdir -p /work \
 && chown bridge:bridge /work \
 && git config --system safe.directory '*' \
 && git config --system user.name "Home Office" \
 && git config --system user.email "home-office@localhost"
USER bridge
WORKDIR /work
ENTRYPOINT ["git"]
