# AI Agent Lab

Private team feedback workspace for multiple GitHub projects. Node 24, React/Vite, Express, built-in SQLite and official MCP SDK.

## Verification

Run `npm ci` then `npm run check`. Never require live provider credentials for tests.

## Invariants

- The explicit opt-in Mac runner polls approved requests and runs Codex CLI in isolated worktrees. Never dispatch from the Railway server.
- New member/admin feedback is queued durably for automatic AI preparation. Server-classified bounded low-risk UI auto-runs; medium needs admin check; high needs explicit high-risk approval.
- Past accepted/rejected decisions may inform preparation as untrusted examples; they never override current scope, risk policy, or approval authority.
- No MCP tool may approve, merge, deploy, delete project data or apply production migrations.
- UI results from the Mac runner first enter a separate browser-verification queue. That worker may push a draft PR and report CI, but must never mark it ready, merge or deploy before admin acceptance. Browser checks run in GitHub Actions, not Chrome launched by LaunchAgent. Failed local checks are preserved when additional verification supersedes them.
- After admin acceptance, an explicitly enabled Mac publisher may push the accepted commit, create a PR, require GitHub CI, merge main and observe Railway deployment. This uses separate release claims, never coding-agent permissions. High-risk releases require explicit confirmation; no production migrations are run by the publisher.
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

