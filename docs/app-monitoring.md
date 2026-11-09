# Connected application monitoring (v1)

Projects in Performance reads runtime reports from application-owned endpoints. This is separate from Lab request/deploy metrics, which remain in AI Agent Lab and can be filtered by registered project. HTTP/CPU/database health are workspace-wide and are explicitly labeled; a project filter never attributes global traffic to a repository.

Configure server-only `LAB_MONITORING_TARGETS` as a JSON array of at most 12 objects:

```json
[{"id":"writer-studio","appId":"writer-studio","name":"Writer Studio","origin":"https://YOUR-SERVICE.up.railway.app","token":"SERVICE-SPECIFIC-SECRET-AT-LEAST-32-CHARS"}]
```

The matching app service requires `LAB_MONITORING_TOKEN`. Use separate random secrets per app. Never store real tokens in Git or frontend environment variables. Origins must be public HTTPS domains without credentials, custom ports, query, fragment or path (see Managing apps in Settings). Lab fetches only `/internal/monitoring?days=1..30`, sends the token server-side, refuses redirects, bounds response size to 2 MiB and times out after 12 seconds. Responses must match protocol, app identity, requested window and freshness. Report reads are admin-only, no-store, cached/single-flight for 30 seconds per target/window; failures are isolated per app and are never converted to zeros. Unavailable reports do not reuse prior success silently.

App reports include current process CPU/heap/RSS/uptime/commit, database round-trip and pool state, deduplicated current article inventory, relational plan/workflow/queue/QC status counts, HTTP route 4xx/5xx/aborts/latencies and new central generate-dispatcher AI calls/errors/tokens/pricing coverage. Historic workflow AI ledger is displayed separately; it is not added to dispatcher usage. AI cost is configured-price USD estimation, not an invoice. Missing prices remain null. Percentiles are histogram upper bounds. Current inventory is not limited by the selected period; HTTP/AI and ledger are. New telemetry begins at deployment and cannot reconstruct missing earlier activity.

This version does not claim container CPU/RAM limits, disk/network, full multi-replica resources, browser errors/RUM/active users, provider invoice reconciliation or uptime during a full application outage. These need provider metrics, client instrumentation or an independent monitor. Snapshot storage uses existing app KV records, best-effort five-second flush; no database migration or business-record writes. Source applications document their protocol and storage separately.

Staging may be configured with these narrowly scoped read-only monitoring targets. They do not register production repositories, copy release bindings, enable workers or grant Lab execution/deployment authority. Main/production Lab remains unchanged until explicitly promoted.

## Project chart presentation

Projects uses a responsive bento layout with distinct chart types tied to the metric: a semicircular gauge for completed HTTP responses without 5xx (aborted calls excluded from its denominator), observed-hour columns for traffic with 5xx overlaid as a subset, percentile bars on an explicit auto-scaled latency axis, content status composition, token composition by model, and ranked known-cost bars. Historical workflow and new dispatcher charts have an explicit source selector and are never summed. Cached tokens stay within input totals; unpriced cost remains missing. Traffic gaps are marked and no unobserved hours are filled with invented zeroes. Workflow bars each use their own status-percentage scale. CPU/RSS, connection health, uptime and commit remain current numeric/status metadata because their source does not provide a historical series or container capacity. Underlying AI/HTTP tables remain available in a disclosure. Charts preserve reduced-motion support and text equivalents for exact values.

## Per-task consumption (task-usage-v1)

Projects reports task tokens, cached/input/output breakdown, known USD estimate, per-call details, status, averages on completed fully measured/priced tasks, and a ranked list. New gate/batch contexts retain one UUID over all central generate calls including application retries; API operations get a request-local context. Calls outside an active known boundary are marked unattributed and do not count as completed task samples. SDK-internal retries remain outside observable token coverage. Empty/cached-only tasks without a generate call do not enter this AI-task cohort. Historical stage/gate rows are a separately selected source, containing only the saved final-result usage; never combine them with new dispatcher tasks. A report reads at most 1,000 records per source; truncated reads/writes are labeled incomplete. Per-call details are bounded (latest 50 tasks, at most ten returned calls each); totals retain all recorded calls. New task records use app KV prefix `lab-task:v1:<UUID>`, best-effort five-second flush, no schema migration or business-content storage.

AI Agent Lab groups its `agent_usage` and legacy `ai_attempts` records by request ID within the existing project-filtered request-creation cohort. Records with no known usage/price remain incomplete. New Lab calls preserve token breakdown and an at-call cost estimate only if `LAB_AI_MODEL_PRICING` configures valid numeric USD-per-million input/output/cached-input rates for that exact model. Missing rates are not guessed or filled from future prices. Example (placeholder values must be verified by the operator): `{"exact-model-id":{"inputUsdPerMillion":1,"cachedInputUsdPerMillion":0.1,"outputUsdPerMillion":2}}`. No pricing is preconfigured by this change. Lab request totals exclude Codex CLI/ChatGPT subscription usage, which the Lab does not receive.

The USD/task threshold control is a session-only dashboard reminder, calculated from known cost; it sends no background or external notification and does not grant spending/retry authority. AI generation and provider exceptions must remain unchanged if telemetry pricing/storage fails.

HTTP latency uses separate lanes for P50, P95, and P99 on a shared horizontal scale that starts at zero. Equal readings have equal bar lengths and P95 has a purple gradient. Missing values show a dash with no fill, and inconsistent percentile values suppress the plot.

## Project performance targets

The dashboard shows the configured targets and reads an optional `performanceKpis` object from the same authenticated app report. All values must describe the requested UTC reporting window:

- `responseTime` and `clickLatency` are `{p95Ms, samples}` for user actions. Measure request submission to the first meaningful result, and click to the first visible UI response, respectively.
- `jobCompletion` contains `{job, workload, p95Ms, samples}` groups measured from a job's start event to its end event.
- `jobs` contains `{executed, technicalErrors, validCompletions}` for the same set of job executions. Report technical errors and validated completions from explicit outcomes. Supply a count of zero only when the outcome was measured and did not occur.

Writer Studio and Intercom Writer Studio emit browser samples for outline generation. Job measurements cover a full Writer Studio batch article and an Intercom EB V2 gate. Both use histogram upper bounds and count only observed runs from the telemetry rollout forward. If any job failure lacks a reliable technical classification, the report leaves the technical error count null for that window. HTTP P95 is displayed as a separate reference and never scored against the user-response target. The AI task ledger starts when the first tracked AI call runs, and its status alone cannot identify technical errors or validate final job output. Missing data stays unmeasured in the dashboard.

### Job history by project

Each project performance table defaults to all saved job history (`jobHistoryAllTime`). It also supports the current UTC reporting window (`jobHistory`). Writer Studio contributes one terminal record per saved batch item. The matching article supplies the saved completion timestamp when available; otherwise the item update selects the reporting window. Duration is shown only when both start and completion are saved. Intercom contributes terminal EB V2 gate records with a saved end time. Both sources include new and historical saved records, so the dashboard does not add the overlapping instrumentation counts. The KPI displays the duration in minutes of the latest job with a saved start and end in the selected scope. Targets are fixed per app and job: Writer batch article 10 minutes (a clean single-pass article took about 3–5 minutes in production; the earlier 60-minute target sat above the observed P95 of 53 minutes and hid retried or paused articles); Intercom Brief and Article 0.25 minutes; Adapt and Review 0.5 minutes. Targets compare unrounded durations. The older P95 aggregates remain available in the report for compatibility. Technical failures are classified from recognizable stored messages and shown as a range when other failure messages remain ambiguous. Success counts require a persisted nonempty result and the source's terminal completion state. Truncated or unavailable sources are marked incomplete.

The content workload section reports completed Writer SEO batch items and stored draft lengths. Intercom reports the latest usable EB V2 article per package and latest active output per package and channel, with counts and stored text lengths per format. Word counts split on whitespace and aggregate across saved content. The monitoring response contains counts and lengths only.

## Self-described app sections (profile-v1)

Any app can join Performance without Lab code changes. Besides the required `protocol`, `appId`, `generatedAt` and `window`, a report needs at least one of `runtime`, `http`, `ai` or `profile`; sections it does not send are hidden rather than shown as zero. `jobHistory`, `jobHistoryAllTime`, `performanceKpis`, `database` and `inventory` keep the meaning described above.

`profile` (`version: "profile-v1"`) lets the app describe what belongs to it:

- `jobTargets`: `{ "<job name>": minutes }`. Used for Job Completion Time when the latest job has that name. It takes precedence over the built-in Writer Studio/Intercom targets.
- `inventoryLabels`: display names for `inventory` keys.
- `mainJob`: `{ title, steps: [string], metrics: [metric], note }`. Replaces the built-in content-workload card.
- `sections`: up to 8 cards, each `{ id, title, description, metrics: [metric], table: { columns: [string], rows: [[string|number|null]] } }`.
- A metric is `{ label, value, format, unit, note, tone }`. `format` is `number` (default), `percent` (0–100), `duration` (ms), `minutes` or `text`. `tone` is `neutral`, `success`, `warning` or `error`. `value: null` means not measured.

The Lab bounds and type-checks every part (`appProfile` in `src/runtime-chart-data.js`) and drops malformed entries instead of guessing. Profile text is rendered as plain text. Reports must still carry counts, durations and statuses only, never personal data or content.

### Managing apps in Settings

Admins add, edit, test and remove apps in **Cài đặt → Monitoring ứng dụng**, without a redeploy. Up to 12 apps in total.

- Stored in SQLite (`settings` key `monitoring-targets-v1`). Tokens are sealed with AES-256-GCM, using a key derived from `LAB_MONITORING_ENCRYPTION_KEY`, or from `SESSION_SECRET` when that is unset. Tokens are never returned by any API.
- If the key changes, the app is marked "Cần nhập lại token" and stops being read. It is never read with a wrong credential.
- Changing an app's address requires entering the token again, so a saved token is never sent to a new host.
- Connection test (`POST /api/settings/monitoring/test`) reports the status, the app id the app reports and which sections it sends. It is not cached and does not return the report body.
- Saving or removing an app clears the 30-second report cache, so Performance shows the change on its next read.
- Origins may be any public HTTPS domain: Railway, Vercel or a custom domain. IP literals, ports, paths, credentials and local/internal names (`localhost`, `.local`, `.internal`, `.railway.internal`, …) are rejected. Redirects are still refused.
- `LAB_MONITORING_TARGETS` still works as a read-only bootstrap list and every entry needs an `appId`. An app saved in Settings with the same id takes precedence. Environment entries are shown with the "Biến môi trường" badge and are removed only in Railway.

### Connection map

Performance → AI Agent Lab shows monitored apps as a separate group below registered projects. Their wires are dotted and their node borders dashed. A node's status comes from the last monitoring read: Đang báo cáo, Báo cáo thiếu dữ liệu, Sai token, or Mất tín hiệu. The same app can appear twice, once as a registered project (repository and runner connection) and once as a monitored app (runtime report), because these are separate connections with different authority. Selecting a monitored app shows its address, app id, last report time and Lab → app latency, and opens its metrics in Projects. Monitored apps never receive feedback, run code or deploy.

### Connecting another app

1. Implement `GET /internal/monitoring?days=1..30` in the app. It returns 404 while `LAB_MONITORING_TOKEN` is unset and 401 for a wrong bearer token.
2. Generate a separate random secret of at least 32 characters. Set it as `LAB_MONITORING_TOKEN` on the app's service.
3. In Lab, open **Cài đặt → Monitoring ứng dụng**. Enter the name, address and token, and press **Kiểm tra kết nối** to fill in the app id. Then press **Thêm ứng dụng**.

Outreach (`Tonytran2209/Project-test`, Python/FastAPI) is the first app connected this way. See `app/lab_monitoring.py` in that repository.

## Tool status (tool-status-v2)

Performance → Projects opens with an overview of every tool, judged by its Main Job. Technical app reports (HTTP, AI, runtime, content) sit in a collapsed "Chi tiết kỹ thuật" section that opens when an app is selected.

### Connecting a tool and automatic detection

In **Cài đặt → Monitoring ứng dụng** an admin enters only the tool name, optional owner, address and token, then presses **Kiểm tra & nhận diện**. Lab reads a 30-day report and shows what it detected; **Lưu tool** stores it. A tool without an address is saved as not connected and shows "No data".

Detection (`detectToolProfile` in `server/tool-performance.js`) runs on save, on **Nhận diện lại**, and at most once a day from the latest successful dashboard read:

- Jobs: every job in `jobRuns`, else `jobHistoryAllTime.completion`, `jobHistory.completion` or `performanceKpis.jobCompletion`.
- Main Job: `profile.mainJob.job` when the app names it; else the single job that other runs name as `parent`; else the only job. Otherwise no job is guessed as main and every job is scored. The display name is `profile.mainJob.title` when present.
- Time targets: `profile.jobTargets` → built-in Writer/Intercom targets → baseline P95 of saved history, rounded up (whole seconds/5/10 seconds under two minutes, whole or 5 minutes above), only with at least the minimum samples.
- Error-rate target: baseline failure rate of the Main Job (or all jobs) rounded up to 0.5%, at least 1%, only with enough runs.
- Every value keeps its source (app, built-in, baseline, manual). "Điều chỉnh job & target" is optional; changed values become manual and survive re-detection. "Khôi phục tự động" clears them.

Stored as `tool` (tool-config-v2) on the `monitoring-targets-v1` entry. `auto: false` stops automatic detection for a tool.

### Run-level data (`jobRuns`, optional)

```json
"jobRuns": { "since": "2026-09-10T00:00:00Z", "complete": true, "runs": [
  { "job": "Bid pack", "workload": ">15 trang", "parent": null, "status": "success", "startedAt": "…", "endedAt": "…" }
] }
```

Send runs that ended (or are still running) in the last 61 days, newest first, at most 5,000; set `complete: false` when truncated. `status` is `success`, `failed` (technical or business failure) or `running` (`endedAt: null`). `parent` names the enclosing job for sub-jobs. Runs carry no content or personal data. With `jobRuns`, Lab computes everything itself: calendar days in Vietnam time (today starts 00:00 GMT+7), the previous period of equal length, median and slowest run, runs over target, per-job error rates, and timeouts (a run still running after three times its target counts as failed). Without `jobRuns`, Lab uses the app's aggregated per-job history and its UTC windows.

### Rules

- Error rate counts every failure (technical and business); unverified completions are reported separately, not as failures.
- Minimum samples (default 20, adjustable per tool): below it a job is "Chưa đủ mẫu", except that with run-level data and at least five runs a median over target is already "Chưa đạt". Error rate is already "Chưa đạt" when failures exceed what the target allows over the minimum sample count.
- Statuses: Đạt, Chưa đạt, Chưa đủ mẫu, Chưa có target, No data. A tool is "Chưa đạt" if its Main Job time or error rate is over target.
- Priorities: slower-than-target jobs ranked by percent over target, and error rates over target (Main Job and sub-jobs) ranked by failure count, in separate lists.
