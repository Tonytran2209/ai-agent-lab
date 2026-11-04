import { performance } from "node:perf_hooks";

const failed = (r) =>
  r.status === "failed" ||
  [
    r.preparation?.status,
    r.verification?.phase,
    r.release?.phase,
    r.delivery?.phase,
  ].includes("failed");
const active = (r) =>
  !["completed", "rejected"].includes(r.status) ||
  Boolean(r.release && !["deployed", "failed"].includes(r.release.phase));
const running = (r) =>
  ["claimed", "running", "verifying", "rechecking"].includes(r.status) ||
  r.preparation?.status === "running" ||
  ["ci", "deploying"].includes(r.release?.phase);
const percentile = (values) =>
  values.length
    ? values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]
    : null;

export function createPerformance(db, service) {
  const startedAt = new Date().toISOString();
  let recordingErrors = 0;
  db.exec(`CREATE TABLE IF NOT EXISTS performance_hours (
    hour TEXT PRIMARY KEY, calls INTEGER NOT NULL, errors INTEGER NOT NULL,
    client_errors INTEGER NOT NULL, total_ms REAL NOT NULL, max_ms REAL NOT NULL
  )`);
  const record = db.prepare(`INSERT INTO performance_hours VALUES (?,1,?,?,?,?)
    ON CONFLICT(hour) DO UPDATE SET calls=calls+1,errors=errors+excluded.errors,
    client_errors=client_errors+excluded.client_errors,total_ms=total_ms+excluded.total_ms,
    max_ms=MAX(max_ms,excluded.max_ms)`);
  return {
    middleware(req, res, next) {
      const start = performance.now();
      res.once("finish", () => {
        try {
          const ms = performance.now() - start;
          record.run(
            new Date().toISOString().slice(0, 13),
            Number(res.statusCode >= 500),
            Number(res.statusCode >= 400 && res.statusCode < 500),
            ms,
            ms,
          );
          db.prepare("DELETE FROM performance_hours WHERE hour < ?").run(
            new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 13),
          );
        } catch {
          recordingErrors++;
        }
      });
      next();
    },
    snapshot(days, projectId) {
      if (projectId) service.project(projectId);
      const now = Date.now(),
        since =
          Date.parse(new Date(now).toISOString().slice(0, 10)) -
          (days - 1) * 86400000;
      const requests = service.list().filter((r) => !r.archivedAt);
      const cohort = requests.filter((r) => Date.parse(r.createdAt) >= since);
      const runner = service.runnerStatus();
      const metrics = (rows) => {
        const durations = rows
          .filter((r) => r.release?.phase === "deployed")
          .map(
            (r) => Date.parse(r.release.deployedAt) - Date.parse(r.createdAt),
          )
          .filter((ms) => Number.isFinite(ms) && ms >= 0);
        return {
          total: rows.length,
          completed: rows.filter((r) => r.status === "completed").length,
          failed: rows.filter(failed).length,
          deployed: rows.filter((r) => r.release?.phase === "deployed").length,
          p95DeliveryMs: percentile(durations),
          deliverySamples: durations.length,
          missingDeploymentTimes:
            rows.filter((r) => r.release?.phase === "deployed").length -
            durations.length,
        };
      };
      const projects = service.projects().map((p) => {
        const rows = requests.filter((r) => r.projectId === p.id);
        const connection = runner.projects?.find(
          (v) => v.projectId === p.id && v.repository === p.repository,
        );
        const current = rows.filter(active);
        return {
          id: p.id,
          name: p.name,
          repository: p.repository,
          enabled: p.enabled,
          runnerEnabled: p.runnerEnabled,
          connection: !p.enabled
            ? "paused"
            : !p.runnerEnabled
              ? "disabled"
              : !runner.lastSeenAt
                ? "unknown"
                : !runner.connected
                  ? "stale"
                  : !connection
                    ? "unknown"
                    : connection.repoReady
                      ? "ready"
                      : "error",
          lastSeenAt: runner.lastSeenAt,
          ...metrics(cohort.filter((r) => r.projectId === p.id)),
          active: current.length,
          running: current.filter(running).length,
          blocked: current.filter((r) => r.projectQueue?.blocked).length,
          attention: rows.filter((r) => failed(r) || r.stopControl?.pending)
            .length,
          latestRelease:
            rows
              .filter((r) => r.release)
              .sort(
                (a, b) =>
                  Date.parse(
                    b.release.deployedAt || b.release.updatedAt || b.createdAt,
                  ) -
                  Date.parse(
                    a.release.deployedAt || a.release.updatedAt || a.createdAt,
                  ),
              )
              .map((r) => ({
                phase: r.release.phase,
                at:
                  r.release.phase === "deployed"
                    ? r.release.deployedAt || null
                    : r.release.updatedAt,
              }))[0] || null,
          runtimeStatus: "unknown",
        };
      });
      const hours = db
        .prepare(
          "SELECT * FROM performance_hours WHERE hour >= ? ORDER BY hour",
        )
        .all(new Date(since).toISOString().slice(0, 13));
      const calls = hours.reduce((n, r) => n + r.calls, 0);
      const errors = hours.reduce((n, r) => n + r.errors, 0);
      const trend = Array.from({ length: days }, (_, i) => {
        const day = new Date(now - (days - 1 - i) * 86400000)
          .toISOString()
          .slice(0, 10);
        return {
          day,
          created: cohort.filter((r) => r.createdAt?.slice(0, 10) === day)
            .length,
        };
      });
      db.prepare("SELECT 1").get();
      return {
        generatedAt: new Date(now).toISOString(),
        startedAt,
        days,
        timeZone: "UTC",
        lab: {
          database: "ready",
          uptimeSeconds: Math.floor((now - Date.parse(startedAt)) / 1000),
          runner: {
            connected: runner.connected,
            phase: runner.phase,
            lastSeenAt: runner.lastSeenAt,
          },
          recordingErrors,
          http: {
            calls,
            errors,
            clientErrors: hours.reduce((n, r) => n + r.client_errors, 0),
            averageMs: calls
              ? hours.reduce((n, r) => n + r.total_ms, 0) / calls
              : null,
            maxMs: calls ? Math.max(...hours.map((r) => r.max_ms)) : null,
          },
          active: requests.filter(active).length,
          running: requests.filter((r) => active(r) && running(r)).length,
        },
        summary: metrics(cohort),
        projects,
        trend,
        recent: cohort
          .filter((r) => !projectId || r.projectId === projectId)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .slice(0, 50)
          .map((r) => ({
            id: r.id,
            projectId: r.projectId,
            title: r.title,
            status: r.status,
            releasePhase: r.release?.phase,
            updatedAt: r.updatedAt,
            failed: failed(r),
          })),
      };
    },
  };
}
