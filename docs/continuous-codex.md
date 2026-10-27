# Continuous Codex conversation

New direct-workflow surveys record the Codex thread ID from JSON events in a local, mode-0600 journal bound to the request, planning job, repository, base, library and shared worktree. Execution and CI repair resume this exact thread; they never use `--last`. The survey remains read-only until the server validates actual source-grounded risk/scope and grants execution. Execution resumes with workspace-write and a fresh result schema. Existing requests without a saved thread use the legacy handoff; a mismatched journal fails closed.

This is one conversation with separate permission-bound turns, not one uninterrupted process. Luna labels and uncertainty are advisory. Codex chooses exact files from current source/MD; high risk, secrets, infrastructure and migrations retain existing authority boundaries. Additional files outside the validated scope still require a new scope assessment; session continuation does not grant arbitrary repository access.

After verified release/library sync, outcomes retain source/result/merge provenance. On later MD drift, relevant historical outcomes remain explicitly `md-changed-revalidate` with current MD excerpts. They are not current rules or training; the current checkout and MD take precedence. Invalidated lessons and missing-file outcomes remain excluded.

## Temporary code-only CI

Project `browserCheckRequired=false` snapshots `ciPolicy.browserRequired=false` on new direct-workflow feedback only. Independent exact-head `writer-check` and all other non-browser checks still must pass. Browser evidence is not asserted. Existing packets retain their original policy.

Managed GitHub workflows support repository variable `LAB_BROWSER_TESTS=disabled`, which skips browser jobs while keeping the code job. Set the variable in both connected repositories when temporarily disabling browser checks; restore it before enabling the project gate. If the workflow and pinned policy disagree, requests that require browser CI wait rather than treating skipped tests as success.
