---
name: security-review
description: Review concrete trust boundaries and reachable security failures in the assigned change.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Security review

Identify what is untrusted, who can invoke each operation, and which process holds credentials or
privileges. Follow the project's actual threat model; do not prescribe cookies, Supabase RLS, blockchain
checks or cloud infrastructure to software that does not use them.

- Check authentication and ownership before sensitive reads and mutations, including IDs passed across
  project/session boundaries. Review reconnect, replay and expired-token behavior.
- Validate input size and structure, path traversal, symlink escapes, URL schemes and shell argument
  boundaries. Parameterize database queries. File extensions and client MIME types do not prove content.
- Trace secrets through process arguments, environment, Docker configuration, logs, persisted events and
  generated artifacts. Report credential locations without reproducing their values.
- Check browser origin/CSP behavior and untrusted rendering. Sanitization is needed when HTML is
  intentionally rendered; ordinary escaped text should remain text.
- Review subprocess cancellation, timeouts, bounded streams and storage growth. A sandbox needs explicit
  mount, network, user, capability and resource policies; broad egress remains a capability.
- Check dependency locks, provenance, image support windows, action SHAs and job permissions. A clean npm
  audit is not a full security review or an OS image vulnerability scan.
- Give each finding a reachable trigger, impact, precise location and proportionate remediation. Separate
  confirmed defects from unverified concerns. Do not invent compliance requirements or disable checks.

Home Office review sessions are read-only in intent: inspect the diff and call `ho_review`. Do not
install scanners, mutate files, publish comments or launch additional models unless the task allows it.
Use current primary documentation for any security claim that depends on external behavior.
