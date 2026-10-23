# Local planning and verified project memory

Default flow: feedback → durable survey queue → Mac Codex read-only survey of the pinned commit → independently validated server risk/scope policy → low-risk automatic execution, medium review or explicit high-risk approval → existing execution claim, independent CI, acceptance and configured publisher.

The server does not call an AI provider in the default mode, including on feedback creation, polling, approval or retries. `LAB_PLANNING_MODE=server` explicitly restores the legacy server analyzer; this is an operational fallback, not automatic. Existing approved/running requests and pinned packets remain unchanged. Pending legacy preparation is migrated on pipeline startup; in-flight survey leases are never silently reclaimed.

## Mac survey

Install updated `mac/runner.js`, `mac/planning.js`, `mac/plan-schema.json`, `server/schemas.js`, `server/ai-context.js` and dependencies via the installer. Reload an existing LaunchAgent once after updating the program. The model runs with `codex exec --ignore-user-config --sandbox read-only`, no inherited Lab/API/provider tokens, no dependencies installed or scripts run in this stage. Official CLI reference: https://learn.chatgpt.com/docs/developer-commands?surface=cli . This is a separate survey invocation before the existing scoped execution invocation, so Codex usage still exists and is not counted as Lab API tokens.

The worker verifies repository, pinned HEAD, isolated detached worktree, unchanged HEAD/status, exact source references, line bounds and content hashes. The server verifies the private survey lease, job/revision fingerprint, observed commit, source-map membership, existing-file evidence and the existing draft/risk policy. Feedback intent sets a conservative risk floor: unclear intent requires at least medium. Memory cannot authorize an edit. Every execution still requires its own bound approval and claim. The coding packet includes the original feedback and context.

Claims expire after 15 minutes and heartbeat every minute; survey process timeout is 10 minutes. Invalid/failed output stops without automatic model retry. Daily budget: 20 claimed survey attempts/project/UTC day; lifetime maximum: 3/feedback. Repeated enqueue/poll calls do not dispatch models. An expired claim stays locked; admin must confirm the old process stopped through the request recovery control, then retry. A failed survey keeps its feedback. If the attempts cap is reached, inspect and prepare manually instead of creating repeated duplicate feedback.

The worker retains its scoped plan JSON locally for audit and removes a clean survey worktree. Unexpectedly modified worktrees are preserved for inspection, never force-deleted. Child stdout/stderr is not persisted. Secrets and files outside the checkout are forbidden references.

## Memory and proposals

Admin → Bộ nhớ project shows bounded project-specific entries, provenance and budgets. Verified lessons require completed/accepted work, passing checks, and independent browser verification or a deployed release, plus an acceptance event. An agent result alone is insufficient. Old eligible accepted requests are imported deterministically when the memory is first read; no model call is made.

Reviewer rejections with a plan are separate `reviewer-decision` entries, never verified implementation facts. Every entry pins project, repo, original/result commits, library, request, criteria and evidence link when available. Admin can disable a misleading lesson; synchronization preserves that choice. At most three relevant keyword-ranked entries are sent to a new survey. Historical paths and assumptions must be rechecked against current code.

Repeated feedback groups are deterministic review proposals with source request links. They do not create or execute changes and do not use a model. This release does not train/fine-tune a model or silently change canonical `.agent-hub` policies.

## Validation

No live provider credentials are required for tests. Survey worker tests use actual temporary Git worktrees and a fake Codex process to verify the read-only CLI, token isolation, original feedback transport and evidence hashes. Service/HTTP tests cover stale output, risk escalation, exclusive/expired leases, bounded retries/budgets, transactional rollback, memory provenance/isolation and admin permissions.

Planning diagnostics use bounded failure categories (scope, validation, report, codex, worker); child output, tokens and arbitrary API messages are never copied into request events. Existing JS/TS test fixtures under tests/browser or tests/agent-lab may accompany a scoped source change when present in the pinned library. This does not authorize CI/config changes or skip medium review. Failed plans stay on disk; retrying a survey remains an explicit, budgeted action.

## Automated medium execution and CI evidence

In impact-auto, low/medium requests execute without a separate admin click when source/dependency evidence, exact scope, reversible behavior and behavioral test plans are complete. A test that is planned but not yet run belongs in verification, not a product-decision checkpoint. High risk and material unresolved decisions still require admin.

Browser checks may run while criterion evidence is pending or failed; this grants no release authority. The server independently reconciles supported explicit Playwright file/grep commands against successful desktop/mobile records in an exact-head GitHub Actions browser-check job. It verifies repository, PR branch/base, single-parent pinned base, allowed paths and both required checks. Generic green CI, skipped cases, missing records and changed scope cannot satisfy criteria. Reconciliation preserves the prior report and leaves all MD requirements and consent-bound delivery gates intact. It performs no model call.
