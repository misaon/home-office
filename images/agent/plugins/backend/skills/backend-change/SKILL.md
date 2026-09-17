---
name: backend-change
description: Load in a work session when the task changes server-side code, an API, a database schema or stored data. How to make the change behind a stable interface, validate at the boundary, keep migrations safe and reversible, and prove the behaviour with tests before reporting.
---

# Changing the backend

1. Read the contract first: the endpoints, types, schemas and events the change touches, and every
   caller of them (grep). A contract change ships with its callers in the same task, or the task
   says why not.
2. Validate where data enters: types, ranges, sizes and encodings at the boundary, a clear error for
   what is rejected, and domain code that never sees transport details. Errors fail closed, keep
   the documented shape, and never leak internals or secrets in messages or logs.
3. Data changes are additive and reversible: expand, backfill, contract in separate steps; never
   rename or drop in the same change that stops writing; add the index a new query needs; run
   backfills in batches. Say in the report which step this task is.
4. Make retries safe: idempotent writes, guarded shared state, timeouts and limits on every outbound
   call and every collection that grows with input.
5. Prove each acceptance criterion with one test at the lowest layer that can prove it — unit for
   logic, integration for the boundary — asserting behaviour, not implementation. Run the whole
   affected suite, not only the new tests, and the floor's check command.
6. Report for the reviewers: what changed and why, how to run it, how each criterion was verified,
   which data step this is and what was deliberately left out.
