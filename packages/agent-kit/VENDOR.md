# Vendored skills

The role packs under `plugins/<role>/skills/*` are copied from **Everything Claude Code (ECC)** by Affaan Mustafa,
MIT license (see `LICENSE-ECC`), repository https://github.com/affaan-m/ecc, commit
`e04ea0b9cc8248686edf5ac751cadff550e162b8` (ECC 2.2.1, 2026-09-03).

Why a subset: the full plugin ships 286 skills, 68 agents and 94 commands; loading it into every sandbox session
would cost context on every turn. Each role gets at most five self-contained skills, loaded on demand by Claude Code
through `--plugin-dir /opt/ho/plugins/<role>`.

| Pack       | Skills                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| `worker`   | coding-standards, verification-loop, git-workflow, error-handling, bun-runtime |
| `reviewer` | coding-standards, security-review, plankton-code-quality, verification-loop    |
| `boss`     | agentic-engineering, context-budget, search-first                              |

To refresh: update the commit above, re-copy the `SKILL.md` files (and companion `*.md` files) and review the diff.
