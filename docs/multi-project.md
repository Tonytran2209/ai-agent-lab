# Multiple projects

Admin → **Thiết lập project** accepts `owner/repository` or a GitHub URL and an optional branch (defaults to the repository default branch). It reads the pinned commit/tree and all 11 standard `.agent-hub` documents, verifies the declared project ID/repository and stores an immutable snapshot. No AI call is used to register or sync a project.

Both Writer Studio and Intercom Writer Studio are included at migration. Existing Writer request/library IDs, claims, artifacts and local checkout remain valid. Intercom's initial snapshot is pinned to its committed canonical library; use Đồng bộ library to update new feedback to the latest commit. Older request packets keep their original version. Changing a repo/branch for an existing project ID is rejected; this prevents retargeting old work.

The project selector scopes Inbox and Library. The feedback drawer explicitly selects a project, and the server derives its repository/base/library from the registry. Members cannot register projects or change execution/release settings. Learning is restricted to the same project/repository. The provider cache includes the project-specific library identity. Existing global AI budgets apply across all projects.

Admin settings:

- **Nhận feedback mới** pauses new feedback and new coding claims for that project. Existing active claims still report results; toggling a setting does not forcibly kill a running coding process.
- **Mac nhận request đã duyệt** authorizes the already installed runner to connect that registered repo and poll its approved requests. It does not approve a medium/high-risk request.
- **Phát hành sau nghiệm thu** defaults off for new projects. It needs an exact Railway environment; the local publisher must also have release enabled. CI, admin acceptance and high-risk confirmation remain mandatory.

The registry lives in the existing SQLite volume, with no production schema migration in any connected repository. Project settings do not accept secrets, executable commands or Mac filesystem paths. Private repos need the existing GITHUB_TOKEN on Railway and `gh` authentication on Mac; no tokens are sent to coding prompts.

## Canonical contract

Required documents: `project.md`; `policies/ownership.md`, `policies/automation.md`; `design/components.md`, `design/design.md`, `design/flows.md`, `design/sources.md`; `backend/api-contracts.md`, `backend/workflow.md`; `database/data-model.md`, `database/storage.md`, all under `.agent-hub/`.

`project.md` declares a heading, repository and either `projectId: example-project` or `**Project ID:** ` followed by a backtick-quoted ID. IDs use lowercase letters/digits/hyphens, 3–64 characters. The current runner uses the shared Node frontend/backend convention: exact layer paths, package-lock files and `npm run check`. Repositories with different ownership layouts/build commands need an explicit adapter; Markdown is untrusted context and cannot introduce arbitrary shell commands or broaden server ownership policy.

## Mac routing

After one update/reload, the runner reads `/runner/projects`, connects enabled projects and clones new repos with `--no-checkout` under its private state directory:

`<stateDir>/projects/<projectId>/repository`

Each new project's journals/worktrees are under its own `state/`. Writer retains its original managed checkout/state. Before claims or publishing, worker routing checks repository and project ID, verifies the local Git origin and pinned library identity, and uses the request's branch. Verification/release workers skip other projects before claiming any lease. The runner currently executes coding jobs sequentially, while all registered projects can receive feedback and queue requests at the same time.

Admin project cards show per-project checkout readiness reported by Mac; this is presence/readiness, not evidence of a successful code change.

## Intercom CI readiness

At registration Intercom had no GitHub workflow. Feedback analysis and approved coding can run, but automatic UI verification needs `writer-check` and `browser-check` from GitHub Actions. A draft PR may be created for inspection; absence of required CI is reported and never treated as passing. Existing admin supplemental visual-verification remains available only after actual verification, tied to the exact result. Automatic release remains off until configured. This change does not modify/deploy the connected Intercom application itself.
