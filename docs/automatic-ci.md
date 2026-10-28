# Automatic CI onboarding

Admin → Thiết lập project exposes **Tự thiết lập CI** on every project. It also offers **Tự thiết lập CI sau khi kết nối** for new repositories. Mac connection must be enabled. This is a durable control-plane job, separate from feedback and from MCP coding requests; it does not consume OpenAI API tokens or run Codex.

Options are explicit and default off:

- Auto-merge the narrowly scoped CI PR after both required checks pass.
- Enable post-acceptance publishing after CI is ready (requires an exact Railway environment). If another admin changes project settings while the job runs, automatic release enabling is skipped; CI can still become ready.

Without auto-merge, successful PR checks show **CI đạt · chờ hoàn tất** with a PR/report link and **Hoàn tất thiết lập**. That button authorizes revalidation and merging of the CI-only PR. Per-feedback admin acceptance/high-risk approval is unchanged.

## State and evidence

`queued → ci → awaiting-merge (optional) → syncing → ready`; existing green CI can go directly to ready without writing any repository files. Failure retains its PR/commit and a bounded event log. Repeat clicks do not restart active work. **Thử lại CI** resumes the same PR. Expired leases remain locked until an admin explicitly confirms that the old worker stopped. Raw lease tokens and hashes never appear in public project responses.

Mac creates a private isolated `lab-ci/<job UUID>` worktree under the selected project's state. It verifies the origin, repository, branch and pinned base, generates deterministic files, verifies the exact diff, pushes without force and opens a draft PR. It does not install/run the repository's scripts or Chrome locally. GitHub Actions executes checks.

The worker verifies check name, GitHub Actions app, exact commit, scope, PR head/base and merge conditions. The server independently verifies GitHub evidence before accepting awaiting-merge/ready, verifies the merged PR and current target-branch head, and syncs the immutable library before ready. A workflow's mere presence is not readiness. Skipped, missing, pending or failing required checks do not pass. Sync after merge also waits for both checks on the target branch.

CI job claim/report routes are authenticated worker APIs; creating jobs/completing/recovering them is admin-only. No new MCP tool can approve, merge or deploy.

## Supported automatic profile

`writer-react-v1` supports the current Writer Studio and Intercom Writer Studio structure: React/Vite, npm lockfiles for root/backend, `npm run check`, the canonical Draft component, i18n/default data and CSS. It tests the real Draft component's editing, in-memory update callback and text export on desktop/mobile. Where EB V2 exists, it additionally loads the real workspace with an isolated deterministic Brief response. Unexpected API/external calls are aborted; there are no production credentials or AI calls.

Managed paths (only added; never overwrite existing files):

- `.github/workflows/agent-lab-ci.yml`
- `playwright.agent-lab.config.mjs`
- `tests/agent-lab/server.mjs`
- `tests/agent-lab/fixture.jsx`
- `tests/agent-lab/draft.spec.mjs`

No application logic, manifests, lockfiles, migrations or secrets are edited. The browser job installs pinned Playwright 1.64.1 ephemerally without saving package/lock changes. Node 22, read-only workflow permissions, exact PR-head checkout, desktop/mobile projects, screenshots and failure traces are configured. No existing regression test is replaced. Coverage is an initial baseline, not a guarantee that every future feedback criterion is covered; new criteria may require additional tests.

Existing successful writer-check/browser-check are preserved and verified. If custom workflows exist without this compatible contract, or source structure differs, setup stops with an adapter-needed message rather than generating a misleading green workflow. No unbounded model fallback or automatic weakening of CI occurs.

## Installation and operations

The Mac runtime additionally needs `mac/ci-setup.js`, `mac/ci-template.js`, `mac/ci-templates/`, `server/ci-evidence.js` and the updated runner. Installer copies these automatically. An already running LaunchAgent needs one reload for this program update; adding projects or requesting CI afterwards requires no reload.

For GitHub CLI OAuth, grant workflow permission once with `gh auth refresh -h github.com -s workflow` and complete browser authorization. Fine-grained tokens require Workflows: write as well as repository contents/pull-request permissions. The worker detects missing OAuth workflow scope before creating a worktree.

Railway's GITHUB_TOKEN needs read access to the connected repos for independent evidence/library verification; Mac `gh` needs permission to push CI branches/create PRs, and to merge only if the admin opted in. Public GitHub rate limits can temporarily stop verification; the job retains its artifact for retry. Unchanged library commits reuse the immutable snapshot after a cheap HEAD check to reduce API calls. Merge failures/branch changes never force-push or rewrite user work.

A CI-config merge may trigger the repository's existing Railway auto-deploy. This workflow does not create/change Railway services, apply production migrations or grant acceptance to any application change.

## Criterion command contract

Browser plans must identify an approved spec and literal `--grep` tag for each criterion. Supported launchers are `node node_modules/@playwright/test/cli.js`, `npx playwright`, and `npx --no-install playwright`, followed by `test tests/agent-lab/NAME.spec.mjs [--config=playwright.agent-lab.config.mjs] --grep SIMPLE_TAG` (or the pinned `tests/browser` convention). Full-suite commands, shell syntax and arbitrary regex are rejected at planning validation. Reports preserve the exact planned command and verification files. Exact-head successful CI must contain passing records for every tag on desktop and mobile; generic green CI never replaces this evidence.

Risk attribution stores Luna's preliminary label, the original Codex survey label, and the policy-enforced final label separately. A policy floor is not described as Codex disagreeing with Luna. Legacy records without the original Codex label are labelled unknown and excluded from Luna/Codex disagreement counts.

## Browser CI environment and failure recovery

Both connected Writer projects use `mcr.microsoft.com/playwright:v1.64.1-noble`, matching their locked `@playwright/test` version. The browser jobs use the image's browsers/system libraries; they do not run APT or download Chromium per run. A preflight checks package/image compatibility and launches Chromium before `Run browser tests`. The onboarding template uses the same pinned image; its existing six-file scope is unchanged.

The two projects keep `writer-check` and `browser-check` as the required check names. Separate `browser-tests (desktop)` and `browser-tests (mobile)` jobs upload exact-commit `lab-test-v1` evidence. The aggregate requires both complete passing packets; missing/skipped/stale/failed records remain failures. Artifacts are keyed by run ID and project, overwritten only for a rerun of that project, so rerunning failed jobs can reuse the successful sibling from the same run/commit.

Each connected project's separate `Retry browser infrastructure` workflow observes metadata only with Actions write permission. It never checks out PR code or reads artifacts/secrets. After the first failed run, it may rerun failed jobs once only when writer-check passed and every failed source job is a browser shard that failed in a recognized environment step before tests started. Assertions, unknown failures, fork runs and later attempts are not retried. The existing main CI has read-only permissions. New onboarding does not install this additional retry workflow automatically; adding an Actions-write recovery workflow requires an explicit project CI maintenance change.

Lab observation remains read-only. It displays each device, current/failed step and job link, treats the aggregate failure as a consequence, and never sends known infrastructure or unknown failures to Codex CI repair. Actual test/code failures remain eligible only under existing repair opt-in, scope and attempt limits. GitHub's retry attempt does not consume a model attempt or change acceptance/release gates. No Mac connection, heartbeat, credentials or LaunchAgent configuration changes are required; the template update is used by the next normal runtime update.

## Read-only CI preflight before Codex work

Production refreshes GitHub HEAD/library before planning/execution queues and again before a claim. Reads are shared per project, cached for one minute, and stored as metadata in SQLite. Unavailable/stale observations block new paid work; they do not change an active or expired claim. No repository code or package script runs on Railway.

The connected projects declare `.agent-hub/ci-contract.json` (`writer-ci-v1`). The library reader checks safe existing workflow/config/fixture/tool paths, matching locked Playwright/image versions and immutable PR-head/base tool checkout. Immutable library identities include the CI profile; old snapshots remain intact. Legacy projects without a manifest are labelled unmanaged instead of claiming a checked CI contract. This is a configuration check, not passing test evidence or release approval.

Fresh queued feedback may advance to the latest base. A completed, unapproved, unleased survey may be archived and queued for a new survey within the existing attempt/day budgets. Prior draft/AI/base/library evidence stays in planHistory. Failed surveys, report-only replays, approved requests, artifacts, and live/expired leases never silently repin or get a new coding authority. Approved stale requests display their pinned base and current main, and use the existing explicit prepare-again action. A configuration/network error remains visible and consumes no Codex claim attempt.

Failure collection reads bounded exact-job logs and retains categories only: environment/infrastructure, configuration/tools mismatch, assertion/test, compiler/code, or unknown. Missing helper files, missing test configuration and image mismatch stop source repair. Only matching test records/explicit assertions or compiler/unit-test errors identify test/code failures; a named failed step alone is insufficient. Log fetch failures remain unknown. GitHub infrastructure retry is bounded separately from the existing opt-in Codex repair budget; acceptance still requires real exact-head passing checks.

The preflight is server-side. It changes neither Mac connection credentials nor heartbeat/LaunchAgent configuration. Tests inject repository readers and run with no live provider or GitHub credentials.

## Versioned adapters (ci-adapter-v1)

New setup requests select `auto`, `writer-react@1` or `existing-ci@1`. The server resolves auto once against the pinned library/source paths and persists the exact adapter id/version on the job. Existing workflows take priority for auto; unsupported structures stop with adapter-needed reasons. Detection is structural, not a successful CI claim. The Mac rechecks package scripts/React/Vite and fixture API compatibility before generation. No arbitrary commands, uploaded adapters, AI-generated workflows or model fallback are accepted.

Writer v1 uses frozen assets under `mac/ci-templates/writer-react-v1/` and adds the original six managed CI files plus `.agent-hub/ci-adapter.json` with SHA-256 hashes. Existing files/workflows/manifests/product source are never overwritten. Versioned templates and generation behavior must change version when their contract changes. The server regenerates the trusted adapter from pinned source and byte-compares every PR file/manifest, verifies added-only paths and a single parent at the approved base, then independently requires exact-head GitHub Actions writer-check/browser-check success. A green result from a modified template is insufficient. Existing-ci v1 only observes the current workflows and the same required checks; it writes no files and does not claim generic green CI covers future behavioral criteria.

After authorized merge, target HEAD CI and library sync are still required. Legacy CI jobs without adapter metadata preserve their old six/five-file contract and old workers remain compatible. New adapter jobs require an explicit ci-adapter-v1 claim; an old worker cannot consume a new job accidentally. Updating the installed Mac runtime when idle enables adapters; existing coding/release queues are unchanged. The frozen template directory is included by the existing recursive installer copy.
