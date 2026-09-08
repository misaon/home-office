---
name: coding-standards
description: Review naming, boundaries, readability and maintainability in the current project.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Coding standards

Follow the current task, repository conventions and active formatter/compiler configuration. Examples
from a different framework are not requirements for this repository.

- Name values and operations for what they represent and do. Prefer explicit units and domain terms.
- Use discriminated unions and validated boundary types; avoid casts that bypass an unresolved error.
- Keep related behavior together. Extract shared logic when callers actually share a contract.
- Prefer a maintained, appropriately sized library for commodity work; inspect its API and lockfile.
- Preserve immutable published state. Local mutation inside an owned simulation or reducer can be
  appropriate; do not copy large collections merely to satisfy a blanket immutability rule.
- Make ownership and cleanup of processes, listeners, streams, subscriptions and timers explicit.
- Keep errors actionable and preserve their causes. Do not turn failed operations into apparent success.
- Let the project's formatter and lint configuration settle style. Manual memoization needs a measured
  reason, especially when a React Compiler is already enabled.
- Evaluate correctness, complexity, memory growth and cancellation together. Prefer bounded queues and
  incremental work over repeatedly scanning full histories.
- Respect task constraints on tests, comments, dependencies and file changes. Do not invent mandatory
  coverage percentages, new documentation files or a framework migration.
