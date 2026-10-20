# Single approval delivery

Admin Settings → project → Phát hành & tự hoàn thành: configure the exact Railway environment, enable release, then enable “Tự hoàn thành sau lần duyệt đầu”. CI must already be ready. This is an explicit project opt-in for newly created feedback only.

Low risk delegates execution/release to the server risk policy. Medium requires one admin approval with release consent. High additionally requires explicit high-risk confirmation. UI makes the merge/deploy authority visible before approving. Consent binds the project configuration revision/environment and approval fingerprint (draft, base, library). Historical requests never acquire consent retroactively.

All such results enter GitHub verification, regardless of layer. Failed local non-browser checks remain blockers. A server reconciler independently reads the PR, file list, commit parent, writer-check/browser-check and statuses on the exact SHA. It accepts only matching repository/head/base/scope and successful CI. Manual browser attestation cannot trigger automatic release. Acceptance records automated-ci provenance and queues the existing separate Mac publisher. Publisher rechecks exact head/scope/CI, merges through a PR, and observes Railway deployment. Coding MCP permissions remain unchanged; no production migrations.

Operational GitHub timeouts/5xx/pending checks get at most three durable attempts, with backoff; no model API calls. Restart recovers pending reconciliation, including an interrupted final attempt. Invalid authority/scope or real failed CI stops immediately, surfaces the reason, and leaves manual exception handling available. CI/publisher failures are preserved; they do not silently trigger another coding run. Editing project settings invalidates previously issued delivery consent. Requests already merging cannot be rolled back by toggling settings.

The Railway server starts reconciliation every 15 seconds. Existing multi-project Mac verification/publishing workers need no reinstall or reload. It remains necessary to keep the Mac awake, connected and authenticated to GitHub, and Railway linked to the repository target branch.
