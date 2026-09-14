---
name: context-budget
description: Reduce unnecessary instructions and tool output using measured session information.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Context budget

Inventory the instructions, enabled tools, loaded skills and repeated output actually used by this
session. Distinguish discoverable skill descriptions from skill bodies loaded on demand. Do not assume
a fixed context window or a universal token cost per tool schema.

Use provider usage/context information when available. Label character-based estimates as estimates;
never present a sample calculation as measured savings.

Prefer targeted searches and bounded reads. Keep task reports concise and preserve decisions, branch,
open questions and failing checks when summarizing. Reuse a conversation when its context is relevant;
avoid appending the same instructions to every turn.

Expose only needed MCP servers and skills. Extra automatic model subprocesses consume real quota and
can escape the office's accounting. Do not install a full marketplace plugin or auto-fix harness as an
incidental optimization. RTK can compress supported command output; keep access to raw failure output
and verify that compression preserves the information needed for the task.
