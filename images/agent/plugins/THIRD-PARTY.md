# Third-party skills shipped in the agent image

Vendored copies, pinned to a commit so every sandbox sees the same text; each directory carries the
upstream licence. Update by copying the upstream files again and changing the commit here.

| Skill (pack)                                  | Upstream                                                                                                                                                      | Commit                                     | Fetched    | Licence                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------- | ------------------------------------------------------------------ |
| `frontend-design` (frontend)                  | [anthropics/skills](https://github.com/anthropics/skills) `skills/frontend-design`                                                                            | `34040c9c568585f6929bedeaad110ad08f079624` | 2026-09-20 | Apache-2.0 (`LICENSE.txt`)                                         |
| `vercel-react-best-practices` (frontend)      | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `skills/react-best-practices` (SKILL.md and `rules/`)                                 | `063bee94c3f4df8453406c830b0a7df0f2860278` | 2026-09-20 | MIT, declared in the skill's frontmatter and the repository README |
| `vercel-composition-patterns` (frontend)      | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `skills/composition-patterns` (SKILL.md and `rules/`)                                 | `063bee94c3f4df8453406c830b0a7df0f2860278` | 2026-09-20 | MIT, declared in the skill's frontmatter and the repository README |
| `web-interface-guidelines` (frontend, review) | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) `command.md`, rules section only, our frontmatter and framing | `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1` | 2026-09-20 | MIT (`LICENSE`)                                                    |
| `vue-patterns` (frontend)                     | [affaan-m/ECC](https://github.com/affaan-m/ECC) `skills/vue-patterns`                                                                                         | `934195f955cf0da847d59fcd6f68856bce112d8b` | 2026-09-20 | MIT (`LICENSE`)                                                    |
| `make-interfaces-feel-better` (frontend)      | [affaan-m/ECC](https://github.com/affaan-m/ECC) `skills/make-interfaces-feel-better`                                                                          | `934195f955cf0da847d59fcd6f68856bce112d8b` | 2026-09-20 | MIT (`LICENSE`)                                                    |

Everything else under `plugins/` is Home Office's own.
