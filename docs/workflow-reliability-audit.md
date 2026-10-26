# Workflow reliability audit — 2026-10-26

## Confirmed incident

REQ-ED2962D3 stopped because `draft.impact.dependencies` contained three explanatory sentences. The CLI output schema accepted arbitrary strings, while the server required exact repository paths with corresponding source evidence. The generic validation message hid the rejected fields.

## Corrections

- Apply server-derived string, array, enum and numeric constraints to both CLI planning schemas. CI checks drift using `npm run schemas:sync` output. Source membership, hashes, line ranges, scope, policy and cross-field relationships remain validated at runtime.
- Explain dependency/evidence path semantics in the direct survey prompt.
- Parse completed survey reports against the actual server schema locally before transmission. Preserve the saved report and field diagnostics; do not silently drop dependencies or expand scope.
- Normalize schema and scope response details before reporting the stopped survey. Preserve typed field paths/codes/messages in local diagnostics and server planning history. Do not send invalid scope-detail objects to the failure endpoint.
- Existing report-only replay revalidates the pinned base and source hashes and calls no model. The incident recovery retains the original report and replaces only dependency descriptions with already-cited exact files.

## Workflow checks reviewed

| Stage | Evidence/guard | Covered failure |
| --- | --- | --- |
| Feedback/classification | Pinned project/MD context, bounded budget and fallback | Provider failure cannot grant authority or parallel execution |
| Survey preparation | Job/base-bound preflight report | Dirty worktree/Git preparation cannot remain silently queued |
| Survey contract | Synchronized schema plus runtime evidence checks | Prose paths, length/count limits, invalid source hashes and stale replay |
| Execution | Exact allowed files, clean pinned worktree, isolated reports | Generated report directories cannot contaminate source scope |
| Local verification | Independent artifact checks and retained history | An old failed attempt cannot block a verified final artifact indefinitely |
| CI repair | Reported successor commit, exact PR/scope and linear ancestry | Known repaired head remains pending until independently verified |
| Acceptance/publication | Successful CI for the accepted commit and bound consent | Pending/stale/failed CI cannot be merged |
| Railway/knowledge | Correct merge commit/environment and separate MD sync | Deployment is not inferred from push; sync retries do not merge twice |

The regression suite exercises these state boundaries with mocked external services. It cannot guarantee future provider availability, arbitrary project behavior or all model-generated plans. Invalid scope, sensitive changes, dirty user work and real failing tests must still stop explicitly.
