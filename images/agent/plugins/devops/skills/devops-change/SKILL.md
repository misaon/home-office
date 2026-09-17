---
name: devops-change
description: Load in a work session when the task changes containers, CI pipelines, infrastructure definitions, deployment or developer tooling. How to make such changes pinned, least-privileged, reversible and verifiable from a clean clone.
---

# Changing infrastructure

1. Understand what runs where before editing: the Dockerfiles, workflows, compose files and
   infrastructure definitions the change touches, and how the repository tests them today.
2. Dockerfiles: pin base images by digest, use multi-stage builds, install only the packages the
   image needs and combine the update and install steps, keep a `.dockerignore`, run as a non-root
   `USER`, add a `HEALTHCHECK` where a service runs. Build the image when the session has a
   container engine; otherwise lint the file and say the build was not run.
3. CI: pin third-party actions to a full-length commit SHA, give `GITHUB_TOKEN` read-only default
   `permissions` and widen per job, never put untrusted input into an inline script (pass it through
   an environment variable), avoid `pull_request_target`, prefer OpenID Connect to long-lived cloud
   secrets, and make failures loud.
4. Infrastructure and configuration: think plan before apply and write the plan into the report;
   configuration through the environment, never a secret in a file; every change names its
   rollback — the previous tag, image or plan.
5. Verify from a clean clone: the affected steps locally (the check command, the image build, a
   workflow linter), so the pipeline does not become the first place the change runs.
6. Report: what changed, how it was verified, the rollback, and anything that needs a human — a
   secret to add, a permission to grant. Never add the secret yourself.
