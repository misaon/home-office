# Plan — task service environments (`docker compose` inside a task)

Owner task, 2026-09-09. One pull request. Supersedes and replaces the research committed in `5ffe658`,
which the owner discarded together with its plan; nothing from it is carried over. Every candidate below
was read from its primary source on 2026-09-09 and the load-bearing behaviour was **measured on this
machine** before the design was chosen — the transcript is in
[audit/VERIFICATION.md](../../audit/VERIFICATION.md).

## What the owner asked for

A repository may carry a `docker-compose.yml` and need it to run — a database, a queue, the app itself.
Home Office agents already run inside containers, so the naive answer is Docker-in-Docker. The owner
asked whether that is still the right answer in September 2026, wanted a wide survey of current tooling,
Docker features and maintained repositories, and wanted the result to stay inside the Docker/container
ecosystem and fit this architecture rather than bolt onto it.

## Where the boundary is today

The boss (`Andrew`) turns chat and mail into scoped tasks with `ho_delegate`; every task session is one
temporary container started by the daemon: non-root `1000:1000`, `CapDrop: ALL`, `no-new-privileges`,
read-only rootfs, tmpfs scratch, memory/CPU/PID limits, on the `ho-agents` bridge with inter-container
communication disabled and **no host mounts at all**. The repository reaches it in a Docker volume that a
network-less git-bridge container fills. There is no Docker CLI in the image and no engine socket
anywhere near the agent, so a repository that needs Compose currently cannot start.

## Owner decisions

| Decision        | Chosen                                                                                           | Rejected                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Engine mode     | Rootless dind by default, rootful as a per-project opt-in                                        | Rootless only (a repo needing enforced limits could never run); rootful default (an escape is root in the Desktop VM); `sbx` as tier 1    |
| Enablement      | Opt-in per project; engine container per session, image/volume cache per task                    | Auto-detect a compose file (pays RAM and disk for tasks that never start a service); one global switch; a per-task choice                 |
| CLI delivery    | `docker-cli`, `docker-cli-compose`, `docker-cli-buildx` baked into the image (+170 MB, measured) | A toolchain volume copied from `docker:29.8.0-cli` (one more moving part); separate `-docker` image variants (doubles the build matrix)   |
| Resource budget | Engine 2 GiB; a session with services costs two scheduler slots                                  | Engine 1 GiB (measured too close to the floor); cutting the agent to 2 GiB (Chromium needs the headroom); asking the owner to grow the VM |

## What was surveyed, and why most of it lost

| Candidate                                                                               | Read            | Verdict                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Docker Sandboxes `sbx` 0.42.1** (2026-09-07), microVM per sandbox with its own engine | docs            | Strongest isolation and Docker's own recommendation for agents, but proprietary, requires a Docker sign-in, and owns the agent, the workspace mount and the network proxy. Adopting it means giving up `ho-runner`, the task volume and git-bridge. **Kept as the tier-2 adapter** |
| **Rootless dind** `docker:29.8.0-dind-rootless`                                         | docs + measured | **Chosen.** dockerd runs as UID 1000 inside a user namespace; `--privileged` is needed only "for disabling seccomp, AppArmor, and mount masks"                                                                                                                                     |
| **Rootful dind** `docker:29.8.0-dind`                                                   | docs            | Full fidelity, and what every CI does, but an escape is root in the shared Docker Desktop VM, which reaches the host engine socket and the virtiofs shares. Per-project opt-in only                                                                                                |
| **Sysbox** (Docker sponsors it; not covered by Docker support)                          | repo            | Solves dind without `--privileged` — on a Linux host where the runtime can be installed. Docker Desktop cannot select it; its derivative, Enhanced Container Isolation, is Business-only. Not available on the supported target                                                    |
| **gVisor `runsc`**                                                                      | docs + issue    | Linux-only, needs tmpfs at `/var/lib/docker` for overlay-on-overlay, and bridge networking for nested Docker was still broken in a January 2026 issue                                                                                                                              |
| **Rootless Podman** (Docker-compatible socket)                                          | docs            | Genuinely avoids `--privileged`, but Compose fidelity for arbitrary third-party repositories is exactly what this feature sells; "very good coverage" is not the same as the engine the file was written against                                                                   |
| **Apple `container` 1.0** (2026-06-09), VM per container                                | docs            | Native, fast, Apache-2.0 — and **no Compose support**, the single most requested issue in the project                                                                                                                                                                              |
| **Docker Offload** (GA 2026)                                                            | docs            | A remote engine per session solves isolation completely, but it is cloud, billed, needs a sign-in and ships the repository off the machine. Not a local default                                                                                                                    |
| **Socket proxies** (Tecnativa 0.5.0, 2026-07-27; CetusGuard)                            | repos           | Filter API endpoints, not the _contents_ of a compose file. They cannot stop `privileged: true` or a `/:/host` bind inside a project the agent legitimately controls                                                                                                               |
| **Dev Containers `dockerComposeFile`**                                                  | spec            | The right mental model — the stack and the agent are one environment — and the source of the "attach the workspace container to the project" idea. Not an isolation mechanism by itself                                                                                            |
| **Dagger `container-use`**, Daytona, E2B, microsandbox                                  | repos           | Agent-environment products in their own right; each replaces the harness rather than fitting inside it                                                                                                                                                                             |

### Why the compose file must not run on the host engine

The tempting cheap design is a broker: the agent asks, the daemon runs `docker compose up` on the host
engine, services become siblings of the sandbox. It is rejected on two independent grounds.

1. **A compose file is a privilege request, not data.** `privileged: true`, `network_mode: host`,
   `pid: host`, `userns_mode: host`, `cap_add`, `devices`, `security_opt`, absolute bind mounts — running
   an untrusted repository's compose file on the host engine hands it everything the daemon has. Auditing
   every field of the Compose specification, forever, is not a boundary; a separate engine is.
2. **The paths would not resolve anyway.** Compose resolves a relative bind source such as `./src`
   against the project directory and sends an absolute path to the engine, which looks for it on _its_
   filesystem. The repository lives in a Docker volume, not on the host, so the host engine would find
   nothing there.

The second point is also the trick that makes the chosen design work: mount the task volume **at the same
path** in the agent and in the engine, and every relative bind mount in the repository's compose file
resolves correctly. Testcontainers documents the same requirement for its "docker wormhole" pattern —
the source directory "must be volume mounted _at the same path_".

## Measured before deciding (Docker Desktop 4.90.0, Engine 29.7.2, 12 CPU / 7.75 GiB VM, arm64)

| Question                                                     | Result                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Does rootless dind run at all inside Docker Desktop?         | Yes. Engine 29.8.0, `containerd-snapshotter=true`, `storage-driver=overlayfs`                                                        |
| Compose available inside it?                                 | Yes, v5.5.1 ships in the image                                                                                                       |
| `docker compose up --wait` from a hardened agent container?  | Works: uid 1000, `CapDrop: ALL`, `no-new-privileges`, read-only rootfs, socket via a shared volume                                   |
| Relative bind mount `./src` from a volume-hosted repository? | Works, because `/work` is mounted at the same path in both containers                                                                |
| Published port from the agent?                               | `127.0.0.1:18080` reachable — the engine joins the agent's network namespace                                                         |
| Engine start                                                 | 2 s cold (empty cache volume), 1 s warm                                                                                              |
| Engine idle cost                                             | 157 MiB RAM; image 549 MB; cache volume 407 MB after alpine + `postgres:18-alpine`                                                   |
| Cold `docker pull postgres:18-alpine` inside the engine      | 8.75 s                                                                                                                               |
| Engine memory floor                                          | Fails at 512 MB (containerd killed during startup), starts at 768 MB                                                                 |
| Does the engine cap bound the whole environment?             | Yes. 1500 MB allocated in a nested container of a 1 GiB engine → the engine is OOM-killed                                            |
| Does `mem_limit:` inside compose work?                       | **No, and it fails silently**: `HostConfig.Memory` is recorded, `memory.max` stays `max`                                             |
| Agent image cost of the CLI                                  | +123 MiB (`docker-cli` 29.5.3-r1, `docker-cli-buildx` 0.34.1-r1, `docker-cli-compose` 5.1.4-r1 from Alpine 3.24 community)           |
| Lifecycle coupling                                           | Stopping the namespace owner leaves the engine running but unrestartable: "cannot join network namespace of a non running container" |

## The design

```
ho-session-<sid>          agent, uid 1000, CapDrop ALL, read-only rootfs, network ho-agents
  /work                   ho-task-<tid>                (task volume, repository at /work/repo)
  /run/user/1000          ho-session-<sid>-sock        (engine socket, runtime state)
  DOCKER_HOST=unix:///run/user/1000/docker.sock

ho-engine-<sid>           docker:29.8.0-dind-rootless, --privileged, --network container:<agent>
  /work                   ho-task-<tid>                <- the same volume at the same path
  /run/user/1000          ho-session-<sid>-sock
  /home/rootless/.local/share/docker
                          ho-task-<tid>-engine         (images, layers, build cache, service volumes)
```

Three properties follow from that shape and they are the reason for it:

- **The compose file runs as written.** Same repository path, a real engine, `docker`, `docker compose`
  and `docker buildx` on `PATH`. Nothing rewrites the file, nothing vets its fields.
- **`localhost` behaves like a laptop.** The engine joins the agent's network namespace, so a published
  port is reachable at `127.0.0.1:<port>` from the agent, from its tests and from Testcontainers. The
  agent keeps its own `/etc/hosts`, so `host.docker.internal` still reaches the daemon gateway.
- **One knob caps everything.** Nested containers share the engine container's cgroup, so the engine's
  memory limit is the environment's memory limit — measured, including the OOM.

Direction of the namespace share is deliberate: the **engine joins the agent**, not the reverse. The
agent is the session's primary lifetime, the runner's connection is what the daemon waits for, and the
engine stays a disposable add-on that can fail without taking the session with it.

### Lifecycle

1. Session provisioning creates the task and provider-state volumes as today, plus `ho-task-<tid>-engine`
   (kept, per task) and `ho-session-<sid>-sock` (discarded with the session).
2. The socket volume is created as a **tmpfs volume owned by the sandbox user**
   (`--opt type=tmpfs --opt o=uid=1000,gid=1000,mode=0700,size=1m`). _Corrected during implementation:
   this plan first called for a one-shot helper container to `chown` a plain volume, because a fresh
   volume's mount point is root-owned `0755`. Measured, that fails — every Home Office container runs
   with `CapDrop: ALL`, so even its root user has no `CAP_CHOWN`, and the engine then died with "need
   writable HOME and XDG_RUNTIME_DIR". The tmpfs volume sets ownership at creation, removes a container
   from the critical path (148 ms → 6 ms for this step) and cannot leave a stale socket behind._
3. The agent container starts unchanged, except for `DOCKER_HOST` and the service-related environment.
4. The engine starts with `--network container:<agent id>` and a Docker healthcheck of `docker version`;
   the daemon waits for `State.Health.Status == "healthy"` before the provider child is spawned. Measured
   cost: 1–2 s.
5. Teardown stops the engine first (15 s grace, so dockerd stops its own containers), then the agent.
   Nested state survives in the per-task cache volume; a follow-up session of the same task starts warm.
6. Restart reconciliation removes orphaned engines the same way it handles orphaned sessions. GC prunes
   `engine` containers and `engine-socket` volumes like session containers, and `engine-cache` volumes on
   the existing task-volume retention.
7. If the engine fails to start, the session **still runs**: the daemon logs a warning with the reason
   and the agent's own brief says the services are unavailable and asks it to report that as the
   blocker, rather than letting it discover a missing `docker` on its own. _Corrected during
   implementation: this plan said "an event records the failure". No runtime event kind fits — the
   existing ones are the provider's own (`init`, `result`, `error`, usage) and an `error` there would
   read as a failed session. Inventing one for this is a separate decision; the log and the brief are
   what exist today._

### Configuration

`DaemonConfig.services`: `enabled` (global kill switch, default `true` — the per-project flag is the real
gate), `image` (digest-pinned `docker:29.8.0-dind-rootless`), `rootfulImage` (`docker:29.8.0-dind`),
`memoryMb` (2048), `cpus` (2), `pids` (2048), `startTimeoutMs` (30000).

`Project.services`: `{ enabled: false, mode: "rootless" | "rootful" }`, shaped like the existing
`publish` and `intake` policies, with an event, an RPC field and a settings toggle.

Rootful mode differs only in the image, the data root (`/var/lib/docker`) and the socket: dockerd runs
with `-G 1000` and `--host=unix:///run/ho/docker.sock`, and the shared volume is mounted at `/run/ho` in
both containers.

### Scheduling

`planSessionStarts` currently spends one unit of `maxConcurrentSessions` per session. It becomes weighted:
a session whose project has services enabled costs two. With the defaults — agent 3 GiB, engine 2 GiB, VM
7.75 GiB — that is the difference between one healthy environment and two that swap the machine to a
crawl. The scheduler is pure and already reads the project through the read model.

## Security posture

- No host Docker socket is mounted anywhere near an agent. The daemon keeps its exclusive ownership.
- Each task gets its own engine: task A cannot see, stop or exec into task B's containers, and cannot see
  the daemon's containers at all.
- Rootless keeps a successful engine escape inside a user namespace: dockerd runs as UID 1000, so the
  privileged container's capabilities are not available to it and the VM's block devices stay unreadable.
- **Accepted risk, to be recorded in ARCHITECTURE.** The engine container runs `--privileged`, which
  Docker documents as "not a securely sandboxed process". In rootless mode the flag exists only to lift
  seccomp, AppArmor and the mount masks, and no process in the container runs as root — but this is still
  the widest boundary Home Office has opened, and it is off unless the owner enables it for a project.
  In rootful mode the honest statement is stronger: a successful escape is root in the Docker Desktop VM,
  and from there the host engine socket, every other task volume and the virtiofs shares are reachable.
- Nested containers reach the internet exactly like agents do; the existing egress accepted-risk entry
  covers them, and a future egress proxy has to cover the engine's networks as well.
- Compose `mem_limit` and `deploy.resources.limits` are accepted and silently ignored in rootless mode.
  Documented, not worked around: the engine cap is the enforced limit, and an over-allocating service
  takes the whole environment down with an OOM the daemon must report as such rather than as a crash.

## Work

Items 1–7 are implemented; what each turned into, and what is deliberately left, is noted inline.

1. **Protocol** — `ServicesPolicy` on `Project` with its event, RPC input and read-model projection.
2. **Core** — a `TaskEngine` port beside `SandboxProvider` in `packages/core/src/sandbox.ts`
   (`ensure`, `waitHealthy`, `stop`, `remove`), engine spec types, and the weighted scheduler.
3. **sandbox-docker** — engine container creation (privileged, `NetworkMode: container:<id>`,
   healthcheck, limits, labels `ho.kind: engine`), health polling, and inventory/prune coverage for the
   new container and volume kinds.
4. **Daemon** — `task-engine.ts` owns names, volumes and the engine's lifetime; provisioning and
   teardown order moved into a new `session-provision.ts` (`session-run.ts` was over the 300-line lint
   limit with the engine in it), plus the config schema, GC kinds, restart reconciliation and the
   services sentence in the work and review prompts.
5. **Image** — `docker-cli docker-cli-compose docker-cli-buildx` in the base stage of
   `images/agent/Dockerfile`; `DOCKER_HOST` and `TESTCONTAINERS_HOST_OVERRIDE` come from the session spec,
   not the image. `TESTCONTAINERS_HOST_OVERRIDE=localhost` is the documented value for this topology and
   is **not yet verified against a real Testcontainers suite**.
6. **UI** — a project setting toggle with the mode and its trade-off (`settings-services.tsx`). The
   engine and its volumes need no UI work: the Resources panel renders whatever `ho.kind` a label says,
   so `engine`, `engine-cache` and `engine-socket` appear there as they are. A per-session badge is
   **left undone** — the prompt tells the agent and Resources tells the owner.
7. **Docs** — ARCHITECTURE (boundary, accepted risk), STACK (pinned engine images and Alpine packages),
   PLAN (implemented entry and audit log), `audit/VERIFICATION.md` (the measurements).
8. **Spike** — **left undone.** The harness that produced the numbers below ran from a scratch directory
   against the real modules. Making it a workspace member (`spikes/task-engine`) means a `package.json`,
   a `tsconfig.json`, a root `workspaces` entry and a lockfile change; worth doing when the two open
   gates are closed, so the harness covers them too.

## Verification gates

None of these is satisfied by reading the code. Gates 1–4 and 7 were measured on 2026-09-09 against
the real adapter and a real engine; the transcript is in
[audit/VERIFICATION.md](../../audit/VERIFICATION.md). Gates 5 and 6 need a full session and are open.

1. `bun run check` green, including the UI build.
2. A real session against a repository with a `docker-compose.yml`: the agent runs
   `docker compose up --wait`, reaches the service on `127.0.0.1`, and teardown leaves no container, no
   network and no socket volume behind.
3. Isolation: from inside a session, `/var/run/docker.sock` is absent, and `docker ps` in task A's engine
   never shows task B's containers or the daemon's.
4. Warm start: a second session of the same task reuses `ho-task-<tid>-engine` and starts the stack
   without re-pulling.
5. Recovery: kill the daemon mid-session; on restart the orphaned engine is reconciled away and the task
   is blocked for explicit resumption, as sessions already are.
6. Budget: with services enabled the scheduler starts one session where it used to start two, and the
   measured RSS of agent + engine + a `postgres` stack is recorded.
7. Failure paths, each producing a legible event: engine fails to start; engine OOM-killed by a service;
   `mem_limit` in a compose file accepted but not enforced.

## Sources, read 2026-09-09

- Docker, [Comparing sandboxing approaches for AI agents](https://www.docker.com/blog/comparing-sandboxing-approaches-ai-agents/) (2026-05-07); [Docker Sandboxes architecture](https://docs.docker.com/ai/sandboxes/architecture/), [install](https://docs.docker.com/ai/sandboxes/install/), [release notes](https://docs.docker.com/ai/sandboxes/release-notes/) (0.42.1, 2026-09-07).
- [Docker Engine 29 release notes](https://docs.docker.com/engine/release-notes/29/) (29.8.0, 2026-09-03; containerd image store default, minimum API 1.44).
- [`docker` official image](https://hub.docker.com/_/docker) — dind, dind-rootless, `DOCKER_TLS_CERTDIR`, the `--privileged` requirement.
- Docker docs, [Rootless mode](https://docs.docker.com/engine/security/rootless/) with its [tips](https://github.com/docker/docs/blob/main/content/manuals/engine/security/rootless/tips.md) and [troubleshooting](https://github.com/docker/docs/blob/main/content/manuals/engine/security/rootless/troubleshoot.md): "Rootless Docker in Docker", "cgroup is supported only when running with cgroup v2 and systemd", the supported storage drivers, and the user-mode network stack.
- [`docker container run` reference](https://docs.docker.com/reference/cli/docker/container/run/) — what `--privileged` grants, `--security-opt`.
- [Compose releases](https://github.com/docker/compose/releases) (v5.5.1, 2026-09-03); [`compose up` reference](https://docs.docker.com/reference/cli/docker/compose/up/) — `--wait`, `--wait-timeout`.
- Testcontainers, [patterns for running tests inside a container](https://java.testcontainers.org/supported_docker_environment/continuous_integration/dind_patterns/) — the same-path requirement, `TESTCONTAINERS_HOST_OVERRIDE`.
- [Sysbox](https://github.com/nestybox/sysbox) and its [dind guide](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/dind.md); Docker [Enhanced Container Isolation](https://docs.docker.com/enterprise/security/hardened-desktop/enhanced-container-isolation/) (Business-only, sysbox-derived).
- [gVisor: Docker in gVisor](https://gvisor.dev/docs/tutorials/docker-in-gvisor/) and [issue #12503](https://github.com/google/gvisor/issues/12503) (2026-01, dind bridge networking).
- [Apple `container`](https://github.com/apple/container) 1.0 (2026-06-09) — no Compose support.
- [Docker Offload GA](https://www.docker.com/blog/docker-offload-now-generally-available-the-full-power-of-docker-for-every-developer-everywhere/); [Tecnativa docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) 0.5.0 (2026-07-27); [CetusGuard](https://github.com/hectorm/cetusguard); [Dagger container-use](https://github.com/dagger/container-use); [Coder: Docker in workspaces](https://coder.com/docs/admin/templates/extending-templates/docker-in-workspaces).
- [Registry as a pull-through cache](https://docs.docker.com/docker-hub/image-library/mirror/) — Hub only; kept as a later optimisation, since it saves network (measured 8.75 s per cold pull) but not disk.
