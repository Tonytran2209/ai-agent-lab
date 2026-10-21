# MD → request criteria → evidence (md-trace-v1)

New requests created by the app require one traceability entry per acceptance criterion. Existing requests retain their approved contract. The default is enabled; MD_TRACEABILITY_ENABLED=false disables attachment for future requests only, never bypassing a contract already pinned on a request.

## Plan

Each entry pins the exact criterion text/index, MD path, start/end lines and verbatim quote. The server validates the quote against the immutable library, computes its content hash and pins the library commit. A fabricated quote, stale line range, foreign MD or changed criterion text fails before approval. References are data, never authority to expand scope or lower risk.

A verification plan states test versus inspection, exact command (empty for inspection), relevant test/source files and expected observations. Referenced files must exist in the pinned source map or be approved additions. Exact test files under tests/agent-lab are supported; additions/docs cause at least medium risk. Editing policies requires high risk. Necessary tests/MD must be scoped before approval.

The planner still receives compact MD context; when an excerpt is insufficient it must read the full pinned MD from its read-only checkout. No additional model call is introduced. The result schema and prompt require the criterion reports and documentation review in the existing coding call.

## Result and acceptance

Each criterion needs one matching report: same index, method, command and files, actual observations, passed/failed. A test report must also match a passing reported check command; inspection needs a concrete observation. Missing, duplicated, mismatched or failed reports block acceptance/release, even if generic build/CI succeeds. A documentation review with a meaningful reason is mandatory; required MD updates must appear in the actual diff. If a needed document falls outside the approval, the runner stops for a scope revision.

Reports are labelled agent-reported. The system validates linkage/coverage/provenance, not the semantic truth of every statement. Generic writer-check/browser-check remains independent exact-commit evidence for the checks it runs, not automatic proof of all criteria. Test command strings are never newly executed by the host outside the existing Codex sandbox. The existing independent full check and GitHub CI are retained.

The request UI provides a compact expandable trace view with pinned GitHub MD links, quotes, verification plans, observations and documentation impact. Advanced manual preparation can edit the structured mapping. A stopped contract can be replanned explicitly: the old artifact is archived, approval invalidated and the next plan re-evaluated. There is no automatic model retry or silent waiver.

## Documentation impact

The server identifies MD mentioning a changed source path/basename and adds relevant canonical UI/API/data documents from the changed layer. These are candidates to review, not a semantic drift verdict. Codex must state either that contracts remain accurate, with reasons, or which documents need updates. Planned required updates cannot be waived by a later no-update statement. Changed MD filenames prove a diff exists, not that its prose is semantically correct.

## Rollout and compatibility

New workers declare md-trace-v1 in planning and coding claims. Old workers cannot consume a new request and spend tokens on an incompatible schema; old requests remain available to them. Runner presence advertises the capability, including across server-issued heartbeat/status updates. The status endpoint now accepts the polling/error phases emitted by the existing worker.

Install updated mac/runner.js, mac/planning.js, mac/plan-schema.json, mac/result-schema.json and server/{schemas.js,ai-context.js,contracts.js,contract-json.js}; reload LaunchAgent once. The installer copies server helpers and all listed Mac schemas. No model training, additional provider API call or target-project deployment is needed for this feature itself.
