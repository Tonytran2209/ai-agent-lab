# CI repair diagnostics

The Mac repair supervisor reports a bounded failure code (Codex exit, blocked report,
invalid report, changed HEAD, missing changes, scope violation, failed project check,
or generic worker failure) and an optional process exit status. Messages use fixed
text rather than raw provider errors. These fields grant no execution/retry/release
permission and do not change the existing two-attempt cap or claim rules.

Codex stdout/stderr remain on the execution Mac in
`<stateDir>/ci-repair-diagnostics/<requestId>-<attempt>.json`, in a mode-0700 directory
with mode-0600 files. They are not included in the report sent to Lab. Treat these
files as private diagnostics; inspect locally rather than uploading raw output.

Deploy the compatible server first, then update the Mac runtime from the trusted
installation source while the runner is safely idle. A server deployment or a
restart of an unchanged runtime alone does not install this worker change. Old
workers remain compatible but retain the old generic failure messages. Previously
discarded failure details cannot be reconstructed by this update.

Repair collection reads up to four distinct failed GitHub jobs, prioritizing
individual shards over `browser-check`. One unavailable log does not discard the
other shard diagnostics. Fetch/worktree/dependency errors are attributed to the
preparation stage, and dirty workspaces report `workspace-dirty` without starting
Codex. Per-request/per-attempt result files preserve interrupted repair reports.
A blocked scope remains blocked: these diagnostics never authorize additional
files or ignore pre-existing CI failures.

If a separately reviewed fix lands on main while the request is failed, sync the
project library and use **Chuẩn bị lại trên main mới**. This admin action archives
the old plan/result through the existing rebase API and prepares a fresh plan.
It is unavailable while any worker holds a claim (including expired claims) or a
release exists. It does not copy old approval to a changed plan or let a repair
silently absorb unrelated baseline changes.

Verification waits for the server when a bounded in-scope test-only successor is
observed, instead of treating it as an immediate unauthorized-head failure. This
never marks checks passed or permits the publisher to merge a different head.

GitHub can expose a new branch ref before PR metadata catches up. For a known
pushed repair, the server verifies the exact branch ref and linear ancestry,
shows actual new-commit job states, and explicitly waits for PR synchronization.
Even green checks during this state cannot promote the artifact until the PR's
actual head/diff is independently verified. Old failed checks cannot trigger a
new coding attempt while PR metadata is stale.
