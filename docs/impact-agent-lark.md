# Impact agent and Lark reporting

## Operating contract

New requests declare `impact-v1` alongside `md-trace-v1`. A compatible Mac planner must claim before spending a Codex survey. Its existing read-only survey examines current code, callers/dependencies, pinned MD and project-specific lessons, then returns a structured impact assessment. This adds fields to the existing survey, not another AI call. Existing requests do not acquire new automatic permission.

Risk and automation are distinct. Semantic major domains (authentication, authorization, billing, data loss, migrations, infrastructure, secrets, policy) force high risk, supplementing existing path/intent floors. Business/API/performance impact is at least medium. High always requires explicit approval. Unknowns, unresolved questions, a stopped execution, or lack of reversibility/data compatibility prevent automatic routing.

`automationMode=impact-auto` permits medium execution only with matching code/dependency evidence, a local survey, a behavioral test plan for EVERY criterion, CI readiness, release enabled and consent-bound automatic delivery. Supported test commands must name a planned `.test`/`.spec` file; generic build/check, inspection and shell chains do not qualify. This validates declared structure, not semantic truth. Coding reports remain agent-attested. Independent exact-commit GitHub CI, scope, base/parent and contract checks are still required before merge. Migration production execution is never granted.

Settings changes to authority (including writing an explicit off value) invalidate release consent; non-authority memory/budget settings do not. Claims validate delivery configuration before coding. Permissions never expand from memories. Medium auto may still stop for failures/conflicts/out-of-scope changes. No unlimited AI repair/retry loop: existing max 3 surveys per feedback and configurable 1–20 per project per UTC day remain; failed coding is not automatically re-dispatched.

## Learning and context

Verified outcomes and reviewer decisions remain separate. Weighted keyword/path retrieval chooses at most 3 relevant project lessons; missing paths or changed cited MD exclude obsolete lessons. Every lesson requires source revalidation at the current commit. Optional admin classification feedback records a labelled example without changing approval or live risk. Matching examples are project/repository isolated, version-bound, and separately labelled as reviewer feedback. Disagreement counts measure reviewed samples, not classifier accuracy. No model fine-tuning, vector embedding calls or automatic policy/threshold updates are introduced.

`npm run eval:impact` is the regression corpus for routing edge cases, executed by the normal test suite. It is not a benchmark of free-form model accuracy. Operations metrics show verified lessons, completed/deployed/failed requests, risk distribution, automatic routes and admin classification disagreements. Request-level failure count is not an execution-attempt rate.

## Post-deploy checks

An optional admin-configured HTTPS `*.up.railway.app` URL is passed to the publisher. After Railway confirms the exact merge commit, publisher GETs that URL without credentials or redirects and requires 2xx. A failed smoke check leaves a failed release with main/deployment provenance intact; no automatic rollback is attempted. An HTTP check proves availability only, not business correctness or the code version served. GitHub deployment evidence supplies commit identity separately. Existing projects have no inferred health endpoint; configure the correct URL explicitly.

## Lark private app bot

Settings → Báo cáo Lark stores App ID, encrypted App Secret and one recipient (`open_id` recommended, `user_id`/email supported). Enable Bot, grant `im:message:send_as_bot` and appropriate message update access, publish the internal app and include the recipient in its availability scope. Use identifiers from that same app/tenant. Official API: [create message](https://open.larksuite.com/document/server-docs/im-v1/message/create), [patch card](https://open.larksuite.com/document/server-docs/im-v1/message-card/patch). Request shapes were checked against the official [Node SDK](https://github.com/larksuite/node-sdk/blob/main/code-gen/projects/im.ts).

One card per NEW request, across all projects, is created and updated in place with current impact, decision, checks, result, commit and recent events. It is not one global card for the entire workspace. PATCH may not generate another push notification. No approval callback or token is embedded: the button opens authenticated Agent Lab. Titles and summaries are sent as plain text; full logs and credentials are excluded. Summaries may contain project information, so choose the intended recipient before enabling.

SQLite `/data/lab.sqlite` holds encrypted settings and a durable coalescing outbox. AES-256-GCM uses `LARK_ENCRYPTION_KEY` if configured, otherwise stable `SESSION_SECRET`; changing that key requires re-entering the secret. GET endpoints never return the secret/access token. Keep the Railway persistent volume and backups. API destination is fixed to open.larksuite.com; no arbitrary webhook host is accepted.

A request has one durable UUID for initial send. Ambiguous retries preserve that UUID and stop after a conservative 50-minute window rather than risk duplicate delivery outside deduplication. If state changes during an ambiguous send, PATCH reconciles the returned message to the latest snapshot. Patches reuse message_id, use shared-card `update_multi=true`, coalesce changes every 15 seconds and back off up to 8 consecutive failures. Recent state survives restarts. Card expiry stops visibly (conservative 13-day update cutoff) rather than creating a second message. Manual retry is available for known rejections or existing unexpired message IDs; uncertain first sends require reconciliation, never silent duplication. Sending is single-process, matching the app's one-replica SQLite deployment.

Changing recipient/app starts a new future-only subscription; pending messages for the previous destination are not redirected. Re-enabling does not replay feedback created while disabled. Resuming already queued older jobs is allowed only at the same destination. Connection tests are explicitly requested messages. No actual Lark send occurs before valid credentials/recipient are configured and enabled by admin.

## Rollout

Install runner/planning/projects/release modules, plan schema and shared `server/{impact,schemas,releases}.js`, then reload LaunchAgent once. New requests wait for the upgraded planner; old contracts are retained. Enable `impact-auto` per intended project in Settings after verifying CI and release configuration. Configure Lark through the password field and use Send test; never paste secrets into chat or commits.
