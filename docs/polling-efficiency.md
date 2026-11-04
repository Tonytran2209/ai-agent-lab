# Polling efficiency and rollout

## Browser

Workspace polling is completion-based, one flight at a time: 15 seconds on Inbox, 30 seconds on other screens, capped exponential error backoff to 120 seconds. Hidden tabs make no background polls and resume once on visibility. Notifications poll at 30 seconds (15 while open); Performance at 60 seconds. Explicit writes and refresh actions still update immediately.

The browser reads a display-only index in keyset pages of at most 200, following every page so existing local search/filter/counts still cover the whole accessible history. Only opening a request fetches the complete report; a changed summary refreshes it. Library loads when Documents is open and the selected immutable version is absent from the browser's single-version cache. Logout clears that cache.

The legacy request API and claim/planning/release APIs are retained. The summary index carries no prompts, source evidence, report bodies or claim hashes. Members see their own non-archived index rows; admin retains archive access. Index projection is performed in SQLite before decoding JSON in JavaScript; queue metadata is observational, never execution authority.

## Server

Library versions are cached per process with at most four entries and eight MiB of serialized input. Entries larger than four MiB bypass the cache. Each caller receives a clone, preserving immutable pinned snapshots even if a caller mutates a return value. The authenticated library route checks its version ETag before loading/serializing content. This bounded cache may increase resident baseline memory slightly; lower traffic does not guarantee lower RAM immediately.

## Mac runtime

Monitor cycles fetch the global verification/release queues once each, then route rows through the existing per-project matching and atomic claim gates. One unavailable queue does not block the other. Recheck rows are also shared within a cycle. CI/deploy monitoring remains independent from coding: 15 seconds with pending remote work and 60 seconds when idle. Main polling waits 60 seconds idle, retaining configured fast cadence when ready work is found and capped error backoff. The MCP client remains connected until a transport error or shutdown. Duplicate unchanged telemetry is coalesced; presence stays at 45 seconds. Existing execution/planning/repair claim heartbeats and supervisor control checks are unchanged.

Deploy the backward-compatible server/UI first. On the trusted runner Mac, update the installed runtime from the reviewed repository revision using the existing installation procedure in `docs/mac-runner.md`, only after all coding and monitor work has drained. A server deployment or restarting the old files does not update that Mac. Do not delete locks, reset worktrees, copy tokens into chat, or stop a live claim to install this update. Browser users must reload once to load the new client.

## Measurement

Before changes, Railway's 500-request sample covered 2026-11-04 07:41:30–07:44:57 UTC (~206 seconds): 46 request-list calls; 45 calls each to config, projects, notifications and library; 42 verification-list calls; 41 release-list calls; 40 MCP POSTs and ten MCP GETs. One-hour Lab metrics at 07:44 UTC: current RAM 0.2923 GB, average RAM 0.3066 GB and average CPU 0.1924. These are observations, not proof of a memory leak.

Deterministic tests compare the old four-endpoint 5-second refresh (240 calls/5 min) with the new idle three-endpoint 30-second refresh (30 calls/5 min, excluding initial load and independent notifications): 87.5% fewer workspace calls. Inbox workspace polling is 12/min versus 48/min previously (75% fewer). Hidden polling is zero. Synthetic large-evidence index fixtures verify >95% payload reduction; this is not a production payload estimate.

Record post-deploy metrics and traffic separately. Old open tabs and the old Mac runtime keep their old polling cadence until reloaded/updated. Short post-deploy RAM samples include startup/GC effects and must not be advertised as sustained savings. Compare at least a full day of equivalent workload after rollout before estimating billing savings.
