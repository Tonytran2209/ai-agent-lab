# AI preparation budgets

`economy-v1` preserves the existing server risk floor, pinned library, exact scope validation and approval fingerprints. It does not change the configured model.

1. A narrowly matched Draft em-dash display request uses a deterministic recipe. Extra requirements fall back to analysis. Recipes and cached drafts pass the same current scope and risk checks as provider drafts.
2. Active feedback with identical text, screen, reproduction and expected result, from the same author and pinned library, returns its existing request. Completed/rejected feedback can be submitted again. Different authors keep separate requests.
3. Persistent exact plan cache includes the model, policy/schema version, pinned library ID, feedback fields, previous draft/result and selected learning. Whitespace is only trimmed at the edges; case, quoted literals and internal whitespace remain significant. Cache stores draft data, never approvals. Updating prompt/schema requires bumping `AI_POLICY_VERSION`.
4. Clear display requests omit backend/database documents; ambiguous requests keep all layers. Project and ownership/automation policies remain intact. Only one short historical example is sent. Stable library context precedes variable feedback to improve provider prefix-cache eligibility; a hit is not guaranteed.
5. HTTP 429 rate limits, 5xx and network failures retry at most three total preparation attempts. Authentication, quota exhaustion, model/JSON/scope/stale-result errors stop immediately. Repeated preparation clicks do not reset a queued/running job.
6. SQLite records each paid-call reservation before dispatch, then records usage even when JSON is invalid or the feedback changed. Cache/template hits create no paid attempt. Credentials, raw prompts and provider error bodies are not in the ledger.

## Railway variables

Defaults apply without adding variables:

- `AI_DAILY_CALL_LIMIT=100`
- `AI_DAILY_TOKEN_LIMIT=500000`
- `AI_REQUEST_CALL_LIMIT=3` (lifetime provider calls for a request, including manual retries)

Use positive integers; invalid values fall back to defaults. Day boundaries use UTC. Reservations use UTF-8 input/schema bytes plus 7,000 tokens for instructions/output; this is conservative admission accounting, not exact tokenization. Actual reported total usage replaces the reservation. Unknown usage, failed connections and interrupted attempts retain their reservation. This prevents retrying unknown charges without a limit, but can stop work early. Limits are internal admission controls, not an OpenAI USD billing cap. Configure provider project budgets separately. They cover Railway analysis only, not Codex subscription/API usage or other applications.

Admin: Connection page shows today's calls, actual tokens, cached provider tokens and unknown/reserved tokens; request advanced details show template/cache/provider source. `/api/ai/usage` requires admin authentication. Collection begins with this release; prior overwritten successful usage is not imported as a complete ledger.

## Mac runner

The coding prompt includes the approved draft, repository/base/library identity and relevant pinned policies/documents. It excludes previous logs, results, approvals and unrelated documents. The full immutable MCP packet remains available. Updating an installed runner requires copying `mac/runner.js` and `server/ai-context.js`, then reloading the LaunchAgent once; future requests require no reload. No Codex usage billing is inferred from MCP polling.
