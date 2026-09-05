# syntax=docker/dockerfile:1
# Home Office git-bridge: the only container that ever sees a host repository.
# Clones a project into a task volume and pushes result branches back. Non-root.
FROM alpine:3.22
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
