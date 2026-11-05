# Connected application monitoring (v1)

Projects in Performance reads runtime reports from application-owned endpoints. This is separate from Lab request/deploy metrics, which remain in AI Agent Lab and can be filtered by registered project. HTTP/CPU/database health are workspace-wide and are explicitly labeled; a project filter never attributes global traffic to a repository.

Configure server-only `LAB_MONITORING_TARGETS` as a JSON array of at most 12 objects:

```json
[{"id":"writer-studio","appId":"writer-studio","name":"Writer Studio","origin":"https://YOUR-SERVICE.up.railway.app","token":"SERVICE-SPECIFIC-SECRET-AT-LEAST-32-CHARS"}]
```

The matching app service requires `LAB_MONITORING_TOKEN`. Use separate random secrets per app. Never store real tokens in Git or frontend environment variables. Origins must be HTTPS Railway app domains without credentials, custom ports, query, fragment or path. Lab fetches only `/internal/monitoring?days=1..30`, sends the token server-side, refuses redirects, bounds response size to 2 MiB and times out after 12 seconds. Responses must match protocol, app identity, requested window and freshness. Report reads are admin-only, no-store, cached/single-flight for 30 seconds per target/window; failures are isolated per app and are never converted to zeros. Unavailable reports do not reuse prior success silently.

App reports include current process CPU/heap/RSS/uptime/commit, database round-trip and pool state, deduplicated current article inventory, relational plan/workflow/queue/QC status counts, HTTP route 4xx/5xx/aborts/latencies and new central generate-dispatcher AI calls/errors/tokens/pricing coverage. Historic workflow AI ledger is displayed separately; it is not added to dispatcher usage. AI cost is configured-price USD estimation, not an invoice. Missing prices remain null. Percentiles are histogram upper bounds. Current inventory is not limited by the selected period; HTTP/AI and ledger are. New telemetry begins at deployment and cannot reconstruct missing earlier activity.

This version does not claim container CPU/RAM limits, disk/network, full multi-replica resources, browser errors/RUM/active users, provider invoice reconciliation or uptime during a full application outage. These need provider metrics, client instrumentation or an independent monitor. Snapshot storage uses existing app KV records, best-effort five-second flush; no database migration or business-record writes. Source applications document their protocol and storage separately.

Staging may be configured with these narrowly scoped read-only monitoring targets. They do not register production repositories, copy release bindings, enable workers or grant Lab execution/deployment authority. Main/production Lab remains unchanged until explicitly promoted.

## Project chart presentation

Projects uses a responsive bento layout with distinct chart types tied to the metric: a semicircular gauge for completed HTTP responses without 5xx (aborted calls excluded from its denominator), observed-hour columns for traffic with 5xx overlaid as a subset, percentile lollipops on an explicit auto-scaled latency axis, content status composition, token composition by model, and ranked known-cost bars. Historical workflow and new dispatcher charts have an explicit source selector and are never summed. Cached tokens stay within input totals; unpriced cost remains missing. Traffic gaps are marked and no unobserved hours are filled with invented zeroes. Workflow bars each use their own status-percentage scale. CPU/RSS, connection health, uptime and commit remain current numeric/status metadata because their source does not provide a historical series or container capacity. Underlying AI/HTTP tables remain available in a disclosure. Charts preserve reduced-motion support and text equivalents for exact values.
