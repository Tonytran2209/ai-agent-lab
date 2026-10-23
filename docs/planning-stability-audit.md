# Planning stability audit, 2026-10-23

REQ-8D05672E had a valid saved survey at its pinned Writer Studio commit. Lab rejected its new `tests/browser/workflow-reopen.spec.ts` because the admission exception covered existing browser tests only. Repeating the survey would charge another model call without fixing that policy mismatch.

## Findings and changes

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| New behavioral browser tests rejected as outside design layer | Central scope-v2 policy accepts exact specs following an existing root/suffix convention, with source evidence; existing frontend helpers can accompany UI changes | contracts.test.js rejects unknown roots, new helpers, CI/manifests, backend paths and unsupported suffixes |
| Failed report could only trigger another paid survey | Separate admin report-only recovery of the same saved artifact, revision/base binding, hash verification, three-send cap and worker protocol handshake | local-planning.test.js and planning-worker.test.js prove zero Codex calls, unchanged paid usage, stale/hash/missing artifact rejection |
| Planner did not receive the actual admission policy; MD was silently truncated | Supply policy and whole-line excerpt metadata; instruct full canonical checkout reads before quoting | MD excerpt regression; existing exact-line/hash contract tests |
| Common language terms biased memory matching | Ignore common Vietnamese/English stop words before overlap scoring | Existing provenance/project isolation memory tests |
| Vietnamese sensitive intent could miss deterministic high-risk floor | Normalize đ and recognize functional authentication/access changes; apply the floor during routing too | Functional login flow is high; display-only login button styling remains low |
| One failing operational worker skipped other projects/planning; presence could show idle during survey | Isolate sequential worker errors and publish running planning presence | runner.test.js tests independent progress and abort behavior |
| Planning queue repeatedly parsed full histories for each job | Compute project usage once per queue snapshot | Existing budget/replay regression suite |

## Verification and boundaries

`npm ci` and `npm run check`: 146 tests pass and production frontend builds. The actual saved REQ-8D05672E draft validates with three criteria and medium risk; its new browser spec is retained. Recovery does not resolve its review checkpoint or confer approval.

Classification remains deterministic safeguards plus a source-grounded Codex survey, not online model training. Memory remains project-isolated, provenance-bound reference. Semantic uncertainty and high-impact changes still require review. Generic passing CI never replaces missing criterion tests or required documentation review. These changes address reproduced flow failures; they do not establish that every possible production failure is eliminated.
