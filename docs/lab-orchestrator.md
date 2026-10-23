# Lab agent, knowledge and cloud operations

## Rollout order and implemented boundaries

1. `knowledge.js`: immutable MD chunks with exact line/hash/commit provenance, MD-to-source relationships and project isolation. Hybrid search combines keywords and explicit Vietnamese/English concepts; the optional semantic layer adds cached text-embedding-3-small vectors, 256 dimensions. Vectors are cached by project/model/exact content, reused across unchanged MD commits and scored with cosine similarity. Query/index calls reserve the same project budget; failed batches require explicit reset, with labelled lexical fallback. Historical pinned versions remain queryable. Verified outcomes include result summaries and criterion evidence; failed incidents remain unverified. Admins may validate, invalidate or supersede a lesson without changing request authority.
2. `agent-evals.js`: twelve bilingual regression cases and operational metrics. Model evaluations require at least 80% exact risk matches and zero missed high-risk cases before activating the same model/version. Real admin disagreements, failed work and repeated surveys are reported separately; no accuracy claim is inferred from successful deploy counts.
3. `orchestrator.js`: durable Railway decision → bounded pinned-source read → grounded plan, or a handoff to a deeper survey. Maximum two reasoning calls/job and one new query embedding, three lifetime calls/request, project/day call and conservative token reservations. No automatic model retries. Exact-input/context/model decision cache. Stale feedback, fabricated sources, unsupported scope and incomplete plans cannot issue approval. Readiness and budgets are visible in Settings → Agent & tự động → Lab Agent.
4. Existing source-grounded impact policy accepts independently read cloud planning evidence as `lab-agent/sourceVerified`, with the same commit, criteria, rollback, high-impact and CI constraints. This is not permission from a model. Mac execution remains available when cloud planning cannot resolve dependencies.
5. `knowledge-maintenance.js`: periodic GitHub sync, persistent backoff, current-version indexing and code/MD drift candidates. Optional `/hooks/github` requires `GITHUB_WEBHOOK_SECRET` and a push webhook signed over original bytes. Only configured repository/branch pushes schedule sync. Sync never rewrites canonical MD or existing request packets. Missing comparison/rate-limit evidence is visible, not interpreted as no drift.
6. Data management: daily integrity-checked SQLite backups in `DATA_DIR/backups`, retain seven. Project export contains snapshots, public requests, events and knowledge, never server settings/credentials. Checksummed restore preview is read-only; restore actual SQLite only after a restore rehearsal on a separate stopped service. Same-volume backups do not protect against volume loss: use Railway volume backups or download a copy into approved external storage.
7. `cloud/worker.js` and `cloud-worker.yml`: manual/opt-in fallback execution on ephemeral GitHub Actions; one survey or approved execution item per run, exclusive claims and unchanged scope. Verification and optional publisher are separate supervisor stages. Local scoped state is retained as a private Actions artifact for seven days if the workflow exits before pushing. Never auto-reclaim expired coding/survey leases after a timeout; first confirm the old process stopped.
8. Settings combines readiness, controls, source lookup, lesson correction, model evaluation, job decisions, token usage, drift candidates, cloud setup and export/backup. Lark keeps the existing one-card-per-request outbox; agent transitions appear in that same card through its event timeline. Existing saved recipients are reused; no new recipient or secret is inferred.

## Enable the Railway agent

- Keep `OPENAI_API_KEY` only in Railway Variables. `GITHUB_TOKEN` needs read access to connected repos. The new settings API never returns these keys.
- Save the selected model while mode is off. Run the twelve-case model evaluation (paid API calls, counted against the selected project's budget). Inspect its result, then enable Lab Agent and save. Existing approved/running requests retain their packets. Only new feedback uses the coordinator; it can be disabled per project.
- Default limits: 20 API calls and 200,000 conservatively reserved tokens per project/UTC day. Evaluation calls are included. These are internal controls, not a USD invoice. Mac/CI Codex usage is separate.
- If the key is absent, evaluation/activation fails explicitly. If provider output, source evidence or context is insufficient, retain the feedback and hand off once to the survey queue. The cloud planner does not run package scripts on Railway.

## Enable the optional GitHub worker

In the Agent Lab repo, create environment `lab-cloud-worker`. Configure variable `LAB_MCP_URL=https://YOUR-LAB.up.railway.app/mcp` and secrets:

- `LAB_MCP_TOKEN`: existing Lab runner credential, entered by the administrator; never copied from Mac by tooling.
- `LAB_OPENAI_API_KEY`: API credential for non-interactive Codex. This uses API billing, not the Mac ChatGPT session.
- `LAB_GITHUB_TOKEN`: Contents/Pull requests write and Actions read on target projects. Publisher requires merge rights already authorized by Lab policies. Do not give admin or workflow-write permission to the coding model.

On Railway, `GITHUB_DISPATCH_TOKEN` requires Actions write only on the Agent Lab repo. `LAB_CLOUD_REPOSITORY` defaults to `Tonytran2209/ai-agent-lab`. Enable cloud fallback explicitly in Settings after configuring the environment; publisher has a separate switch. The workflow dispatch group is exclusive and spend is capped. An ambiguous dispatch reserves its slot and is not immediately repeated; absence of a successful workflow is not readiness evidence. A run may need an administrator to satisfy GitHub environment protection rules.

The worker is not a replacement for scoped permissions. It cannot approve, widen scope or apply production migrations. A failed upload/push or expired claim needs artifact inspection; do not discard the artifact and pay for another model run blindly. The cloud workflow is manual by default and does not run from pull requests.

## Limits that remain explicit

There is no model training/fine-tuning, cross-project memory sharing or autonomous policy relaxation. The semantic layer stores bounded embedding vectors in SQLite alongside an inspectable concept dictionary; retrieval scores do not confer factual truth or authority. Grounding verifies source provenance and contract syntax, not automatic semantic truth of every model statement. CI and reviewed outcomes remain mandatory. External backup destinations and cloud credentials require administrator setup; they are not invented or transferred silently.

API implementation follows [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs); the worker uses [Codex CLI API-key login](https://learn.chatgpt.com/docs/cli/reference). Neither model calls nor CLI credentials are used by automated tests.

Semantic search follows [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings). Enable it separately in Settings. The source index is bounded at 150 chunks/8KB per chunk; exceeding the limit yields an explicit lexical fallback rather than silently truncating authoritative MD.
