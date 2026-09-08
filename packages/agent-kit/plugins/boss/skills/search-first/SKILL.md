---
name: search-first
description: Find existing repository code and maintained dependencies before creating new abstractions.
license: MIT
metadata:
  origin: ECC, adapted for Home Office
---

# Search before implementation

Start with the repository's relevant implementation and package manifests. Determine the missing
behavior and constraints before searching for another package or copying a template.

Use available official documentation, registry metadata and upstream source to compare candidates:
API fit, release activity, license, transitive dependencies, bundle/runtime cost and platform support.
Verify exact APIs and versions. A package name or search snippet is not enough evidence.

Adopt a suitable library directly; add a thin adapter only for a real application boundary. Keep custom
code when candidate libraries would require comparable replacement logic or introduce unrelated state.
State unavailable search channels and unresolved compatibility instead of claiming a complete survey.

Use only tools and colleagues exposed by this session. Home Office delegation goes through its scoped
MCP tools; no external researcher agent, Context7 server or global skill directory is assumed present.
