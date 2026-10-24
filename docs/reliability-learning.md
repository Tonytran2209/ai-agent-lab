# Reliable delivery and classification improvement

## 1. Recover the approved workflow

`ciRepairEnabled` is a per-project opt-in. Independently observed failed GitHub CI can queue at most two Codex repair attempts for low/medium requests with unchanged release consent. Each attempt starts from the observed PR head in a new worktree, reads failed job logs, preserves exact allowedPaths and reports fresh documentation/inspection results. The supervisor pushes a fast-forward commit on the same PR; the coding process has no publisher credentials. Independent CI/criterion reconciliation remains the only route to acceptance. No scope expansion, force-push, test skipping, production migration or merge is authorized by the repair queue.

A failed attempt on the same head is not automatically repeated. A new failed CI head may use the remaining attempt. Expired repair leases remain locked until an admin confirms the old worker stopped. Mac and cloud share the same server lease. Mac updates require one LaunchAgent reload.

The new reporter emits `LAB_TEST_V1` JSON records and `test-results/lab-evidence.json`, including the actual checked-out commit, test ID, file, project, title, final status and retry index. The collector checks exact job/head, required desktop/mobile records and approved tags. Malformed/failed/skipped records cannot become green via the legacy parser. Old list-format CI remains compatible during rollout. Inspection evidence is explicitly agent-attested, and a repaired commit requires refreshed inspection evidence.

Deploy recovery runs every 30 seconds. It can resume up to three transient PR/deploy observation failures under existing consent. It never re-merges an already merged PR or re-runs migrations. Terminal Railway failure and smoke-check errors remain visible. Library sync derives durable pending work from deployed requests and retries with bounded exponential backoff, even after server restart. A successful sync releases the project FIFO lane.

## 2. Record outcomes and labels separately

`learning_profiles`, `learning_reviews`, `learning_runs`, `learning_usage` and `learning_settings` live in the existing SQLite database on the configured data volume and are covered by whole-database backups. Profiles record feedback, pinned code/MD, Luna/Codex risk, changed paths, test/doc evidence, deploy provenance and post-deploy incidents.

CI success and Codex risk are observations, not ground-truth classification labels. Only explicit admin risk feedback enters the reviewed dataset. Identical normalized feedback is grouped before reference/holdout splitting. Marking an incident excludes the outcome from successful retrieved examples until resolution is recorded. Historical source changes remain marked for revalidation. MD edits remain part of an approved project PR; syncing only reads GitHub.

## 3. Evaluate prompt/context changes in the background

Knowledge settings expose a separate daily token budget (default 20,000), evaluation opt-in, version, activation opt-in, rollback and per-request incident review. Production requests keep using the active version without waiting for evaluation. Both baseline and candidate use the shared production classification instructions. Holdout evaluation removes retrieved lessons/reviewer answers to avoid leakage.

The candidate is a bounded curated instruction variant, not a model-weight update. Activation requires >=90% evaluated accuracy, no high-risk misses, no regression against baseline, >=20 human labels including >=4 real holdouts, and matching model/library/reference/dataset versions. These thresholds are deployment gates, not a claim of production accuracy. Fixed policy cases alone cannot activate a candidate. Interrupted/failed paid calls keep their reservations and are not retried automatically that day. Evaluation is at most one automatic run per project/day when enough holdouts exist.

## 4. Prepare for a future supported classifier

The admin dataset export preserves labels, provenance and split membership. It does not submit training jobs, send provider credentials, train GPT-6 Luna or switch models. A future model/provider adapter needs a supported training API and independent held-out evaluation before activation. Current production risk floors, scope and release consent are never learned or widened by this subsystem.
