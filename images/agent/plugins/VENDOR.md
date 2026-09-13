# Role skill provenance

These packs were originally selected from Everything Claude Code by Affaan Mustafa, MIT license,
[commit e04ea0b9cc8248686edf5ac751cadff550e162b8](https://github.com/affaan-m/ecc/tree/e04ea0b9cc8248686edf5ac751cadff550e162b8).
The original copyright and license remain in [LICENSE-ECC](LICENSE-ECC).

On 2026-09-08 the selected guidance was shortened and adapted for Home Office's task protocol. It is
no longer an unmodified vendor copy. Examples for unrelated frameworks, nonexistent tool references,
fixed token estimates, publication instructions and automatic model-fixer setup were removed. Plankton
and the cloud-infrastructure companion are not installed or shipped.

| Pack     | Skills                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| worker   | coding-standards, verification-loop, git-workflow, error-handling, bun-runtime |
| reviewer | coding-standards, security-review, verification-loop                           |
| boss     | agentic-engineering, context-budget, search-first                              |

Each pack is independently loadable with Claude Code's `--plugin-dir`. The two shared short guides are
copied into both worker and reviewer packs so a pack has no external path dependency. Keep those copies
identical when updating. ACP providers do not automatically load Claude plugin directories.

Refresh by reviewing upstream changes against the local adaptations, not by overwriting the packs.
Rebuild provider images after changes; the image freshness hash includes these files and plugin metadata.
