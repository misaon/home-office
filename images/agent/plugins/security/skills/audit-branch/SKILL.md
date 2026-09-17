---
name: audit-branch
description: Load in a review session when the reviewer is the security engineer. How to audit a task branch for security and performance: map entry points and trust boundaries, trace inputs to their sinks, check the OWASP Top 10 classes, secrets and dependency changes, then the hot paths, and order findings by severity with the scenario that exploits each.
---

# Auditing a branch

1. Map the change: new or changed entry points (handlers, commands, file and environment reads,
   messages), the trust boundaries crossed, the data stores touched, and dependency changes
   (`git -C /work/repo diff <base>...HEAD -- '*lock*' package.json`).
2. Trace every input from its entry point to every sink: validated at the boundary, encoded at the
   output, parameterised in queries, no path traversal, no server-side request forgery, no unsafe
   deserialisation. This covers injection, broken access control and authentication failures.
3. Configuration and cryptography: insecure defaults, secrets in code, configuration or logs (grep
   for keys, tokens and passwords), transport security, hashing and randomness. Never print a secret
   you find; name the file.
4. Supply chain and integrity: is a new dependency maintained, pinned and reflected in the lockfile,
   does it run install scripts, is downloaded content verified? Logging and exceptional conditions:
   are failures logged without secrets, do errors fail closed, are limits and timeouts enforced?
   Insecure design: is the feature safe by construction, or only by the happy path?
5. Performance on the paths the change adds or touches: unbounded loops and collections, N+1
   queries, a new query without its index, blocking calls in asynchronous code, synchronous work on
   a hot path, memory that grows with input, missing timeouts and limits. Measure where you can —
   run the suite with timing, profile one hot function — instead of guessing.
6. Findings: numbered, severity first (critical, high, medium, low), each with the scenario ("an
   attacker who…", "with ten thousand rows…"), `path:line`, and the change that would satisfy you.
   Approve when nothing above low remains; low items go into the approval as notes for the head of
   development.
