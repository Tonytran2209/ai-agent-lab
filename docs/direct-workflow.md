# Direct feedback workflow

Default: feedback → one Luna routing/classification → Codex on Mac (survey then implement in the same project worktree) → code/tests and relevant canonical MD → one exact-commit CI gate → authorized main merge → Railway confirmation → verified feedback/context library.

Low/medium use configured impact-auto rights. High and genuine product decisions retain approval. Classification is provisional and never authorizes code paths by itself. The survey returns exact source/test/MD paths, impact and a short verificationPlan; no MD quote/line-number matrix or test-tag evidence reconciliation. Browser CI runs through the configured project workflow. Independent scope, artifact lineage and successful required jobs still precede automatic release.

Code checks, result documentation review and honest summary remain visible. MD/criterion traces on migrated requests are historical reference, not release blockers. The server migrates idle active requests on startup; live/expired leases, executing surveys and publishing requests are preserved. Already-passed CI may transition straight to release; failed checks do not become passing through migration.

Mac keeps one `state/workspace` per project. Survey is read-only there; implementation and bounded CI repair reuse it sequentially. Branch refs preserve prior commits. Dirty or foreign workspaces stop with a recoverable operational error; never reset or delete uncommitted work. Historical worktrees are not deleted automatically. CI/setup/recheck administrative tasks remain separate from the feedback path.

Exact required GitHub jobs are observed with finite worker deadlines. Missing PR, failed CI or credentials should report the actual stage/error, never wait for per-criterion test names. Verified feedback memory is stored after deployment with provenance; this is retrieval/context, not model-weight training.

A fast-forward test-only commit after an already-reviewed repair may complete without another model/report cycle. The server independently verifies the same PR identity, full scope, linear ancestry including the reviewed repair, exact-head successful writer/browser jobs, and a compare delta limited to approved test specs. New production/config/helper changes do not qualify. The current check result is labelled GitHub Actions writer-check, with original local results preserved in history; no criterion evidence is fabricated.

Read-only Codex surveys have a 15-minute first-pass deadline and a 20-minute total budget if one successful plan needs a diagnostic pass. Heartbeats continue throughout; the process group is stopped and awaited before releasing a claim. Timeout, heartbeat loss, runner shutdown and nonzero Codex exit have separate public reasons. Failed model calls are never automatically retried.

Survey activity is collected from Codex JSON events, independently of runner heartbeat. Only stage/counters/timestamps reach Lab; model text and tool arguments are excluded. After three minutes without an event, the task shows that it is waiting on Codex rather than implying ongoing source activity. This telemetry grants no scope, approval or completion authority.

A classification-to-survey handoff failure is recorded as failed with an actionable queue/budget message. Exhausting three survey attempts must never look like a successful handoff or automatically create another model call; manual planning remains available.
