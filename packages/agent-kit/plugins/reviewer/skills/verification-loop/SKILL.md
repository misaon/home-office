---
name: verification-loop
description: Verify implemented behavior and report the checks actually performed.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Verification loop

1. Read the current package scripts and tool configuration. Run commands that exist in this repository
   using its selected package manager; do not copy an npm/Next.js workflow into an unrelated project.
2. Run the relevant compiler, lint, format and build checks. Preserve the process exit code when
   limiting log output; a successful `head` or `tail` does not prove the producing command succeeded.
3. Run applicable existing verification scenarios. Write tests only when the active task permits them.
4. Inspect the final diff for unintended files, missing cleanup, stale documentation and exposed data.
   Secret checks must report locations or counts without printing credential values.
5. Distinguish passed, failed and unverified behavior. Static checks do not establish live provider,
   browser, deployment or security behavior. Do not report invented coverage or benchmark results.
6. Repeat checks after relevant changes or failures, not on a fixed timer while nothing has changed.

Inside a Home Office work session, commit the requested changes and finish with `ho_report`; publication
belongs to the daemon. Review sessions report through `ho_review` and do not modify the work tree.
