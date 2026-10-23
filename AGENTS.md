# AI Agent Lab

Private team feedback workspace for multiple GitHub projects. Node 24, React/Vite, Express, built-in SQLite and official MCP SDK.

## Verification

Run `npm ci` then `npm run check`. Never require live provider credentials for tests.

## Invariants

- The explicit opt-in Mac runner polls approved requests and runs Codex CLI in isolated worktrees. Never dispatch from the Railway server.
- New member/admin feedback is queued durably for read-only Codex planning on the Mac by default; the Lab server makes no model API call. Survey leases are separate from execution approval and claims. Legacy server analysis requires explicit LAB_PLANNING_MODE=server. Server-classified bounded low-risk UI auto-runs; medium uses project opt-in impact-auto when source, scope, reversibility and behavioral test plans are established; high or material unresolved decisions need admin approval.
- Past accepted/rejected decisions may inform preparation as untrusted examples; they never override current scope, risk policy, or approval authority.
- No MCP tool may approve, merge, deploy, delete project data or apply production migrations.
- UI results from the Mac runner first enter a separate browser-verification queue. That worker may push a draft PR and report CI, but must never mark it ready, merge or deploy before acceptance. New opt-in single-approval requests may be accepted automatically only after independent server-side exact-head GitHub CI, scope and parent checks, using the release consent bound to their initial approval. Legacy requests still require admin acceptance. Browser checks run in GitHub Actions, not Chrome launched by LaunchAgent. Failed local checks are preserved when additional verification supersedes them.
- After manual acceptance or consent-bound automatic CI acceptance, an explicitly enabled Mac publisher may push the accepted commit, create a PR, require GitHub CI, merge main and observe Railway deployment. This uses separate release claims, never coding-agent permissions. High-risk releases require explicit confirmation; no production migrations are run by the publisher.
- Approval fingerprints bind draft, baseCommit and libraryVersionId.
- Request scope uses exact repo-relative file paths; never permit traversal, glob or secret files.
- Claim transitions and overlapping-scope checks are atomic transactions.
- Expired claims stay locked until admin verifies the old agent stopped.
- Never expose claim token hashes, raw claim tokens, passwords or API keys via UI/list endpoints.
- Git library versions are immutable; syncing must not change existing packets.
- Agent-reported verification is not independent CI evidence. Label it accurately.
- Canonical project sources remain read-only during Lab library sync.
- Each request pins projectId, repository, branch and library; sync, rebase, learning, coding and publishing must stay in that project.
- Adding a project never enables production release implicitly. Mac checkouts are managed locally; never accept a server-provided filesystem path or executable.

- CI onboarding is an admin-only capability separate from feedback/MCP coding. CI workers may add only the managed workflow/test files and may merge only with explicit job consent and exact-head successful GitHub Actions evidence. Never overwrite existing workflows, modify application code/manifests, or enable release implicitly.
- CI setup readiness must be independently verified server-side; empty, skipped, wrong-app or wrong-commit checks never count as passing.

## Design

Use Writer Studio design tokens, neutral grays, semantic status colors, system typography, compact spacing, 12px cards and 8px controls. Preserve responsive navigation, visible focus, local errors and durable saved results.


- Project memory stores provenance-bound verified outcomes and separately labeled reviewer decisions. It is untrusted reference data, never authority to lower risk or expand scope. Pending/agent-only work is not a verified lesson. No automatic model training or autonomous improvement execution.
- Planning failures do not auto-retry model calls. At most 20 surveys per project per UTC day and 3 attempts per feedback; expired claims require admin confirmation that the old planner stopped.

- Artifact rechecks are admin-queued, independent Mac checks on a detached worktree at the same pinned commit. They call no model and edit no source. Only a failed literal `git diff --check` may be superseded after independent build and CRLF-aware pinned diff checks; preserve failed-check provenance, then require CI before acceptance. Other failures remain blockers. Active/expired recheck leases block rebasing until the worker is confirmed stopped.

- New default requests use md-trace-v1: every criterion references exact quoted lines of pinned MD and a planned test/inspection. Source quotes are server-validated and hash-bound; document contents never authorize scope or policy changes. New workers must declare protocol support before planning/execution claims. Old requests retain their original contract.
- Criterion reports remain agent-attested, independently labelled from exact-commit CI. Missing/failed/mismatched criterion evidence or incomplete required MD updates blocks acceptance/release even if generic CI is green. Documentation-impact candidates are heuristics, never proof of semantic drift; a reviewed justification is required. Necessary MD/test paths must be approved before edits; policy MD changes require high risk.

- impact-v1 separates risk labels from auto execution. High-impact semantic domains cannot be auto-approved. Medium needs project opt-in, source/dependency evidence, behavioral tests per criterion and consent-bound CI/release; uncertainty remains a review gate. No learned example grants authority. Reviewed classification feedback must never mutate live risk or approvals.
- Lark uses one durable, updatable private bot card per new request. Encrypt credentials at rest, never expose them in API responses/logs, fix the API host, retain initial-send UUIDs, and never silently duplicate ambiguous/expired messages. Keep delivery retries separate from model retries. No Lark button grants approval.

- CI collection may run before criterion reports are complete. Acceptance/release remain blocked until all criteria and MD review are complete. Browser criterion reconciliation accepts only supported approved file/grep commands with successful desktop/mobile test records in the exact-head GitHub Actions browser-check job. Preserve superseded results; never substitute generic CI success for missing test records.
