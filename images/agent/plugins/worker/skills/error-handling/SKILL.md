---
name: error-handling
description: Handle failures, cancellation and retries without hiding incomplete operations.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Error handling

Use the project's existing result/error contract. Expected domain failures should be distinguishable
from transport failures and programming errors. Preserve useful causes without exposing credentials or
unbounded tool output in messages.

- Check HTTP status before interpreting response bodies. A resolved fetch promise is not HTTP success.
- Retry only transient failures when replaying the operation is safe. Mutations need idempotency or
  reconciliation; use bounded backoff and honor cancellation.
- Bound external operations and process shutdown. Release acquired resources if a later startup step fails.
- Remove abort listeners and subscriptions when consumers finish. Propagate overflow or disconnection
  instead of silently losing state changes.
- Do not catch an error only to return a success-shaped value. Best-effort operations must say whether
  their outcome is pending, failed or unknown.
- Keep detailed diagnostics bounded and private; give the user enough context to recover.
- Avoid adding circuit breakers, wrapper hierarchies or repeated error logging without an actual need.
