// tool-status-v1: BA "Tool Performance" rules. Pure functions so the dashboard and tests share them.
// A tool is judged by its Main Job: P95 time against a Lab-declared target and error rate
// (technical + business failures) against a Lab-declared target. Never guess missing data.
import { jobCompletionTarget } from "./runtime-chart-data.js"

export const statusLabels = {
  bad: "Chưa đạt",
  insufficient: "Chưa đủ mẫu",
  notarget: "Chưa có target",
  nodata: "No data",
  ok: "Đạt",
}
export const statusOrder = { bad: 0, insufficient: 1, notarget: 2, nodata: 3, ok: 4 }
export const defaultMinSamples = 20

const count = (v) => Number.isSafeInteger(v) && v >= 0
const positive = (v) => Number.isFinite(v) && v > 0

// Time status for one job: P95 is only scored with at least `minSamples` runs.
export function timeStatus({ p95Ms, samples, targetMinutes }, minSamples = defaultMinSamples) {
  if (!count(samples) || samples === 0 || !Number.isFinite(p95Ms)) return "nodata"
  if (!positive(targetMinutes)) return "notarget"
  if (samples < minSamples) return "insufficient"
  return p95Ms > targetMinutes * 60000 ? "bad" : "ok"
}

// Error status: below the sample minimum a tool is already "bad" once its failures exceed what the
// target allows over `minSamples` runs (more runs can only lower the rate to that bound).
export function errorStatus({ failed, executed, target }, minSamples = defaultMinSamples) {
  if (!count(executed) || executed === 0 || !count(failed) || failed > executed) return "nodata"
  if (target == null || !Number.isFinite(target)) return "notarget"
  if (executed < minSamples) return failed > (target / 100) * minSamples ? "bad" : "insufficient"
  return (100 * failed) / executed > target ? "bad" : "ok"
}

// Runs and failures for the selected window. Saved job history first (all failures count),
// otherwise instrumented job outcomes, where anything not validly completed is a failure.
export function jobOutcomes(report) {
  const h = report?.jobHistory
  if (h && count(h.executed) && count(h.failed) && h.failed <= h.executed)
    return { executed: h.executed, failed: h.failed, unverified: count(h.unverifiedCompletions) ? h.unverifiedCompletions : 0, complete: h.complete === true }
  const j = report?.performanceKpis?.jobs
  if (j && count(j.executed) && count(j.validCompletions) && j.validCompletions <= j.executed)
    return { executed: j.executed, failed: j.executed - j.validCompletions, unverified: 0, complete: true }
  return null
}

export function reportedJobUnits(report) {
  const rows = report?.performanceKpis?.jobCompletion
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r) => typeof r?.job === "string" && r.job.trim() && count(r.samples))
    .slice(0, 50)
    .map((r) => ({
      job: r.job.trim().slice(0, 100),
      workload: typeof r.workload === "string" ? r.workload.slice(0, 100) : "",
      p95Ms: Number.isFinite(r.p95Ms) && r.p95Ms >= 0 ? r.p95Ms : null,
      samples: r.samples,
    }))
}

const ratio = (u) => (positive(u.targetMinutes) && Number.isFinite(u.p95Ms) ? u.p95Ms / (u.targetMinutes * 60000) : -1)

function worst(units) {
  return [...units].sort((a, b) => ratio(b) - ratio(a) || (b.samples || 0) - (a.samples || 0))[0] || null
}

// Evaluate one declared or connected tool. `result` is the monitoring read (may be missing).
export function evaluateTool({ id, name, tool, connected = true, result = null }) {
  const config = tool || {}
  const minSamples = Number.isSafeInteger(config.minSamples) && config.minSamples > 0 ? config.minSamples : defaultMinSamples
  const report = result?.report || null
  const profile = report?.profile || null
  const reported = reportedJobUnits(report)
  const declared = Array.isArray(config.jobs) ? config.jobs : []
  const targetFor = (job) => {
    const own = declared.find((j) => j.name === job)
    if (own && positive(own.targetMinutes)) return own.targetMinutes
    return report ? jobCompletionTarget(report.appId, job, profile) : null
  }
  const withStatus = (u) => {
    const targetMinutes = targetFor(u.job)
    return { ...u, targetMinutes, status: timeStatus({ ...u, targetMinutes }, minSamples) }
  }

  // Declared jobs keep their order and role; a job without its own measurement is "unmeasured".
  // Without declarations every reported job is shown, so connected apps still work unconfigured.
  const jobs = declared.length
    ? declared.map((j) => {
        const units = reported.filter((u) => u.job === j.name).map(withStatus)
        return { ...j, role: j.role || "sub", units, unmeasured: units.length === 0 }
      })
    : [...new Set(reported.map((u) => u.job))].map((job) => ({
        name: job, role: "sub", units: reported.filter((u) => u.job === job).map(withStatus), unmeasured: false,
      }))
  const declaredMain = jobs.find((j) => j.role === "main")
  const allUnits = jobs.flatMap((j) => j.units.map((u) => ({ ...u, role: j.role })))
  const headline = declaredMain ? worst(declaredMain.units) : worst(allUnits)

  const outcomes = jobOutcomes(report)
  const error = outcomes
    ? { ...outcomes, rate: outcomes.executed ? (100 * outcomes.failed) / outcomes.executed : null, target: config.errorRateTarget ?? null }
    : { executed: null, failed: null, rate: null, target: config.errorRateTarget ?? null, unverified: 0, complete: false }
  error.status = errorStatus(error, minSamples)

  // Status uses the Main Job when one is declared; sub-jobs feed the priority list.
  const scored = declaredMain ? declaredMain.units : allUnits
  const statuses = [...scored.map((u) => u.status), error.status]
  let status
  if (!connected || !report) status = "nodata"
  else if (statuses.includes("bad")) status = "bad"
  else if (statuses.every((s) => s === "nodata")) status = "nodata"
  else if (statuses.includes("notarget") || (declaredMain && declaredMain.unmeasured) || !scored.length) status = "notarget"
  else if (statuses.includes("insufficient")) status = "insufficient"
  else status = "ok"
  // Without any time measurement the tool has no scored time target yet.
  if (status === "ok" && !headline) status = "notarget"

  const reason = !connected
    ? "Chưa kết nối nguồn dữ liệu"
    : !report
      ? "Không đọc được báo cáo từ app"
      : status === "nodata"
        ? "Chưa có lần chạy nào trong kỳ"
        : null

  return {
    id, name, connected, status, reason, minSamples,
    owner: config.owner || "", mainJob: config.mainJob || declaredMain?.name || headline?.job || "",
    driver: config.driver || null, headline, jobs, error, appStatus: result?.status || null,
  }
}

// Optimisation priorities across tools (BA): slower-than-target jobs ranked by % over target,
// and failure rates over target ranked by failure count. Kept separate: they are not comparable.
export function priorities(evaluated) {
  const time = [], errors = []
  for (const t of evaluated) {
    if (!t.connected) continue
    for (const j of t.jobs)
      for (const u of j.units)
        if (u.status === "bad")
          time.push({ toolId: t.id, tool: t.name, job: j.name, role: j.role, workload: u.workload, p95Ms: u.p95Ms,
            targetMinutes: u.targetMinutes, samples: u.samples, overPercent: (100 * (u.p95Ms - u.targetMinutes * 60000)) / (u.targetMinutes * 60000) })
    if (t.error.status === "bad")
      errors.push({ toolId: t.id, tool: t.name, job: t.mainJob, failed: t.error.failed, executed: t.error.executed, rate: t.error.rate, target: t.error.target })
  }
  time.sort((a, b) => b.overPercent - a.overPercent)
  errors.sort((a, b) => b.failed - a.failed)
  return { time, errors }
}

export function summarize(evaluated) {
  const counts = { bad: 0, insufficient: 0, notarget: 0, nodata: 0, ok: 0 }
  for (const t of evaluated) counts[t.status]++
  return counts
}
