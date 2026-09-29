FROM alpine:3.24.2@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
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
