# Notification center

Notifications report activity; they grant no execution, retry, approval, merge or deployment authority.

The durable SQLite log retains each request event, operational Mac transition, onboarding/CI/deployment setup phase, MD synchronization, model evaluation and Lark delivery state and signed-in user's quick notification. Request-event insertion and notification insertion share the same SQLite transaction. Existing request events are backfilled on upgrade; old browser-only toasts cannot be reconstructed. There is no 30-item history cap: the drawer loads earlier pages on demand.

Members see only events on their own requests and their own quick notices. Administrators also see operational and setup events. Client notices are always user-owned and explicitly labelled by view; client input cannot forge a system event or foreign request reference. All writes require the existing session and CSRF token. Only whitelisted display metadata is copied from worker/setup tables; no raw claims, credential blobs, tokens or model output are included. Existing project exports do not include other users' notification history; full SQLite backups preserve the log.

Read cursors are stored per existing role/display-name identity and survive sessions. The first visit establishes a read baseline so backfilled history does not appear as a flood of new work. Later unread counts reflect new notification records, rather than the number of requests.

A browser-local outbox retains quick notices until the server acknowledges them. Separate keys per notice avoid cross-tab overwrites; server idempotency makes retries safe. Failed synchronization is visible in the drawer. Browser storage limits/unavailability can prevent offline persistence; the UI asks the user to keep the tab open while pending notices synchronize. Authenticated history is server-backed once acknowledged.

Mac monitoring reads existing presence metadata every 15 seconds; it records connection expiry/reconnection and state changes without repeating heartbeat notices. It neither contacts Codex nor resets workers. Setup triggers observe phase/note changes, not claim-token updates. Request heartbeat events remain in history but do not repeatedly produce quick toasts.

Quick notifications appear at the top right and shrink toward the actual header bell after five seconds. Hover/focus pauses dismissal. Reduced-motion preferences suppress the travel animation. The drawer remains available via keyboard and retains all acknowledged notices after toasts disappear.

New authenticated API routes: GET /api/notifications (before, limit), POST /api/notifications (idempotent user notice), POST /api/notifications/read (monotonic visible read cursor). Existing request/config/worker API contracts remain unchanged.

Settings operation notices and errors are mirrored through a shared React notice context without altering their existing inline messages or API handlers. Empty values, input drafts and repeated unchanged polling errors do not create notifications. Model evaluation history copies only outcome/phase metadata, never evaluation cases or model/provider output.
