// tool-status-v2: BA "Tool Performance" rules, shared by the dashboard, Settings and the server.
// A tool is judged by its Main Job: P95 time and error rate (technical + business failures)
// against targets. Jobs, the Main Job and targets are detected from the app's real data;
// an admin may override them. Missing data is never guessed or shown as zero.

const jobTargetsMinutes = {
  "writer-studio": { "Writer batch article": 10 },
  intercom: { "EB V2 brief": 0.25, "EB V2 article": 0.25, "EB V2 adapt": 0.5, "EB V2 review": 0.5 },
}

// A target the app declares in its own profile wins; the built-in map keeps older reports working.
export function jobCompletionTarget(appId, job, profile = null) {
  if (profile?.jobTargets && Object.hasOwn(profile.jobTargets, job)) return profile.jobTargets[job]
  const targets = jobTargetsMinutes[appId]
  return targets && Object.hasOwn(targets, job) ? targets[job] : null
}

export const statusLabels = {
  bad: "Chưa đạt",
  insufficient: "Chưa đủ mẫu",
  notarget: "Chưa có target",
  nodata: "No data",
  ok: "Đạt",
}
export const statusOrder = { bad: 0, insufficient: 1, notarget: 2, nodata: 3, ok: 4 }
export const defaultMinSamples = 20
// An unfinished run older than this multiple of its target counts as a failure (timeout).
export const timeoutFactor = 3
export const reportTimeZone = "Asia/Ho_Chi_Minh"
const vnOffsetMs = 7 * 3600000

const count = (v) => Number.isSafeInteger(v) && v >= 0
const positive = (v) => Number.isFinite(v) && v > 0
const text = (v, max = 100) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
// A run's workload may name its document after " · " ("1 SEO article · <title>"). Statistics,
// targets and the stored profile use the class before it; run history shows the full name.
export const workloadClass = (w) => (typeof w === "string" ? w.split(" · ")[0].trim().slice(0, 100) : "")

// Nearest-rank percentile over sorted values.
export function percentile(sorted, p) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length))) - 1]
}

// Calendar-day windows in Vietnam time: "today" starts at 00:00 GMT+7; N days covers today and
// the N-1 days before. The previous window is the same length immediately before.
export function periodBounds(days, now = Date.now()) {
  const dayStart = Math.floor((now + vnOffsetMs) / 86400000) * 86400000 - vnOffsetMs
  const start = dayStart - (days - 1) * 86400000
  return { start, end: now, previousStart: start - days * 86400000, previousEnd: start }
}

// Bounded, type-checked run list (optional `jobRuns` section of app-monitoring-v1).
// Runs marked `estimated` were reconstructed by the app, not measured: they appear only in run
// history (includeEstimated) and never in P95, targets, success rates or job detection.
export function parseRuns(report, { includeEstimated = false } = {}) {
  const section = report?.jobRuns
  const rows = Array.isArray(section?.runs) ? section.runs.slice(0, 5000) : []
  const runs = []
  let accepted = 0
  for (const r of rows) {
    const job = text(r?.job)
    // startedAt may be null for a finished run: it then counts for error rates but not for time.
    const startedAt = r?.startedAt == null ? null : Date.parse(r.startedAt)
    const endedAt = r?.endedAt == null ? null : Date.parse(r.endedAt)
    if (!job || !["success", "failed", "running"].includes(r.status)) continue
    if (startedAt !== null && !Number.isFinite(startedAt)) continue
    if (endedAt !== null && !(Number.isFinite(endedAt) && (startedAt === null || endedAt >= startedAt))) continue
    if (r.status === "running" ? startedAt === null || endedAt !== null : endedAt === null) continue
    accepted++
    const estimated = r.estimated === true
    if (estimated && !includeEstimated) continue
    runs.push({ job, workload: text(r.workload, 200) || "", parent: text(r.parent), runId: text(r.runId),
      parentRunId: text(r.parentRunId), status: r.status, startedAt, endedAt, ...(estimated ? { estimated: true } : {}) })
  }
  return { runs, since: Date.parse(section?.since) || null, complete: section?.complete === true && rows.length === accepted }
}

function durationStats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return { samples: sorted.length, p95Ms: percentile(sorted, 0.95), medianMs: percentile(sorted, 0.5), maxMs: sorted.at(-1) ?? null }
}

// Per job/workload statistics for one window, from runs. Unfinished runs past the timeout fail.
function runWindowStats(runs, start, end, targetFor) {
  const groups = new Map(), outcomes = new Map()
  for (const r of runs) {
    const target = targetFor(r.job)
    const timedOut = r.status === "running" && positive(target) && end - r.startedAt > timeoutFactor * target * 60000
    const at = r.endedAt ?? (timedOut ? r.startedAt + timeoutFactor * target * 60000 : null)
    if (at === null || at < start || at >= end) continue
    const o = outcomes.get(r.job) || { executed: 0, failed: 0, timedOut: 0 }
    o.executed++
    if (r.status === "failed" || timedOut) o.failed++
    if (timedOut) o.timedOut++
    outcomes.set(r.job, o)
    if (r.status !== "success" || r.endedAt === null || r.startedAt === null) continue
    const workload = workloadClass(r.workload)
    const key = r.job + "\u0000" + workload
    const g = groups.get(key) || { job: r.job, workload, values: [] }
    g.values.push(r.endedAt - r.startedAt)
    groups.set(key, g)
  }
  const units = [...groups.values()].map((g) => {
    const target = targetFor(g.job)
    return { job: g.job, workload: g.workload, ...durationStats(g.values),
      overRuns: positive(target) ? g.values.filter((v) => v > target * 60000).length : null }
  })
  return { units, outcomes }
}

// Job units for the selected window from the best source the app sends:
// jobRuns (computed here) → saved job history per job → instrumented jobCompletion.
export function jobUnitsFor(report, days, { now = Date.now(), targetFor = () => null } = {}) {
  const { runs } = parseRuns(report)
  if (runs.length) {
    const b = periodBounds(days, now)
    const current = runWindowStats(runs, b.start, b.end, targetFor)
    const previous = runWindowStats(runs, b.previousStart, b.previousEnd, targetFor)
    const units = current.units.map((u) => {
      const p = previous.units.find((x) => x.job === u.job && x.workload === u.workload)
      return { ...u, previousP95Ms: p?.p95Ms ?? null }
    })
    return { source: "runs", units, outcomes: current.outcomes, previousOutcomes: previous.outcomes }
  }
  const history = Array.isArray(report?.jobHistory?.completion) ? report.jobHistory.completion : null
  const kpis = Array.isArray(report?.performanceKpis?.jobCompletion) ? report.performanceKpis.jobCompletion : null
  const rows = history?.length ? history : kpis || []
  const units = rows
    .filter((r) => text(r?.job) && count(r.samples))
    .slice(0, 50)
    .map((r) => ({ job: text(r.job), workload: workloadClass(text(r.workload, 200) || ""), samples: r.samples,
      p95Ms: Number.isFinite(r.p95Ms) && r.p95Ms >= 0 ? r.p95Ms : null, medianMs: null, maxMs: null, overRuns: null, previousP95Ms: null }))
  return { source: history?.length ? "history" : kpis ? "instrumented" : null, units, outcomes: null, previousOutcomes: null }
}

// Runs and failures for the window (all failures count). Runs → saved history → instrumented outcomes.
export function jobOutcomes(report, runOutcomes = null, mainJob = null) {
  if (runOutcomes?.size) {
    const pick = mainJob ? [runOutcomes.get(mainJob)].filter(Boolean) : [...runOutcomes.values()]
    return pick.reduce((a, o) => ({ ...a, executed: a.executed + o.executed, failed: a.failed + o.failed, timedOut: a.timedOut + o.timedOut }),
      { executed: 0, failed: 0, timedOut: 0, unverified: 0, complete: true })
  }
  const h = report?.jobHistory
  if (h && count(h.executed) && count(h.failed) && h.failed <= h.executed)
    return { executed: h.executed, failed: h.failed, timedOut: 0, unverified: count(h.unverifiedCompletions) ? h.unverifiedCompletions : 0, complete: h.complete === true }
  const j = report?.performanceKpis?.jobs
  if (j && count(j.executed) && count(j.validCompletions) && j.validCompletions <= j.executed)
    return { executed: j.executed, failed: j.executed - j.validCompletions, timedOut: 0, unverified: 0, complete: true }
  return null
}

// Time status for one job: P95 is only scored with at least `minSamples` runs. With fewer runs the
// job is already "bad" when even its median is over target (known only from run-level data).
export function timeStatus({ p95Ms, samples, targetMinutes, medianMs = null }, minSamples = defaultMinSamples) {
  if (!count(samples) || samples === 0 || !Number.isFinite(p95Ms)) return "nodata"
  if (!positive(targetMinutes)) return "notarget"
  if (samples < minSamples) return Number.isFinite(medianMs) && samples >= 5 && medianMs > targetMinutes * 60000 ? "bad" : "insufficient"
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

// Round a baseline up to a readable target: seconds under 2 minutes, whole minutes otherwise.
export function niceTargetMinutes(ms) {
  if (!positive(ms)) return null
  const seconds = ms / 1000
  if (seconds < 120) {
    const step = seconds <= 10 ? 1 : seconds <= 60 ? 5 : 10
    return (Math.ceil(seconds / step) * step) / 60
  }
  const minutes = seconds / 60
  return minutes <= 30 ? Math.ceil(minutes) : Math.ceil(minutes / 5) * 5
}

function allTimeUnits(report) {
  const { runs } = parseRuns(report)
  if (runs.length) {
    const groups = new Map()
    for (const r of runs) {
      if (r.status !== "success" || r.endedAt === null || r.startedAt === null) continue
      const g = groups.get(r.job) || []
      g.push(r.endedAt - r.startedAt)
      groups.set(r.job, g)
    }
    return { source: "runs", jobs: [...groups].map(([job, values]) => ({ job, ...durationStats(values) })) }
  }
  const rows = [report?.jobHistoryAllTime?.completion, report?.jobHistory?.completion, report?.performanceKpis?.jobCompletion]
    .find((r) => Array.isArray(r) && r.length) || []
  // Several workload groups per job: the baseline uses the largest group.
  const jobs = new Map()
  for (const r of rows) {
    const job = text(r?.job)
    if (!job || !count(r.samples) || !Number.isFinite(r.p95Ms)) continue
    const old = jobs.get(job)
    if (!old || r.samples > old.samples) jobs.set(job, { job, samples: r.samples, p95Ms: r.p95Ms, medianMs: null, maxMs: null })
  }
  return { source: rows === report?.jobHistoryAllTime?.completion ? "history" : "report", jobs: [...jobs.values()] }
}

function workloadsOf(report, job) {
  const names = new Set()
  for (const r of parseRuns(report).runs) if (r.job === job && workloadClass(r.workload)) names.add(workloadClass(r.workload))
  for (const rows of [report?.jobHistoryAllTime?.completion, report?.jobHistory?.completion, report?.performanceKpis?.jobCompletion])
    if (Array.isArray(rows)) for (const r of rows) if (text(r?.job) === job && workloadClass(text(r.workload, 200))) names.add(workloadClass(text(r.workload, 200)))
  return [...names].slice(0, 10)
}

// Detect a tool profile from one real report. `previous` keeps admin overrides (source "manual").
// Main Job: declared by the app (profile.mainJob.job), else the single parent of other runs, else
// the only job. Otherwise no job is guessed as main and every job is scored. Targets: app-declared → built-in → baseline P95 of saved history (rounded
// up, only with enough samples). Error-rate target: baseline failure rate rounded up to 0.5%.
// Sub-jobs the app declares for its Main Job (profile.mainJob.job + steps), listed even before
// they have measured runs.
function declaredSteps(report) {
  const main = text(report?.profile?.mainJob?.job)
  const steps = Array.isArray(report?.profile?.mainJob?.steps) ? report.profile.mainJob.steps : []
  return main ? { main, steps: [...new Set(steps.map((s) => text(s, 80)).filter(Boolean))].slice(0, 12) } : { main: null, steps: [] }
}

// Every job name a report knows: measured runs, saved history, and the app's declared Main Job/steps.
export function reportJobNames(report) {
  const base = allTimeUnits(report), declared = declaredSteps(report)
  // Declared Main Job and steps first, in the app's order, so sub-jobs read as a pipeline.
  return [...new Set([...(declared.main ? [declared.main, ...declared.steps] : []),
    ...base.jobs.map((j) => j.job), ...parseRuns(report).runs.map((r) => r.job)])].slice(0, 20)
}

export function detectToolProfile(report, previous = null, { now = Date.now(), minSamples = defaultMinSamples } = {}) {
  const prior = previous || {}
  const priorJobs = new Map((prior.jobs || []).map((j) => [j.name, j]))
  const base = allTimeUnits(report)
  const { runs } = parseRuns(report)
  const declared = declaredSteps(report)
  const names = reportJobNames(report)
  const declaredMain = declared.main
  const parents = new Set(runs.map((r) => r.parent).filter((p) => p && names.includes(p)))
  const manualMain = (prior.jobs || []).find((j) => j.role === "main" && j.roleSource === "manual" && names.includes(j.name))?.name
  const main = manualMain || (declaredMain && names.includes(declaredMain) ? declaredMain : null) ||
    (parents.size === 1 ? [...parents][0] : null) || (names.length === 1 ? names[0] : null)

  const jobs = names.map((name) => {
    const old = priorJobs.get(name) || {}
    const stats = base.jobs.find((j) => j.job === name)
    const appTarget = report?.profile?.jobTargets && Object.hasOwn(report.profile.jobTargets, name) && positive(report.profile.jobTargets[name])
      ? report.profile.jobTargets[name] : null
    const builtin = jobCompletionTarget(report?.appId, name, null)
    let targetMinutes = null, targetSource = null
    if (old.targetSource === "manual") [targetMinutes, targetSource] = [old.targetMinutes ?? null, "manual"]
    else if (appTarget) [targetMinutes, targetSource] = [appTarget, "app"]
    else if (builtin) [targetMinutes, targetSource] = [builtin, "builtin"]
    else if (stats && stats.samples >= minSamples) [targetMinutes, targetSource] = [niceTargetMinutes(stats.p95Ms), "baseline"]
    const role = old.roleSource === "manual" ? old.role : name === main ? "main" : "sub"
    return {
      name, role, roleSource: old.roleSource === "manual" ? "manual" : "auto",
      targetMinutes, targetSource,
      baselineP95Ms: stats?.p95Ms ?? null, baselineSamples: stats?.samples ?? 0,
      workloads: workloadsOf(report, name),
      parent: runs.find((r) => r.job === name && r.parent)?.parent || (declared.steps.includes(name) ? declared.main : null),
      startEvent: old.startEvent || "", endEvent: old.endEvent || "", successCondition: old.successCondition || "",
      perItem: old.perItem === true,
    }
  })
  // A manual Main Job wins; any other job marked main by an older detection becomes a sub-job.
  if (jobs.filter((j) => j.role === "main").length > 1) for (const j of jobs) if (j.role === "main" && j.name !== main) j.role = "sub"

  const history = report?.jobHistoryAllTime || report?.jobHistory
  let errorRateTarget = prior.errorRateTargetSource === "manual" ? prior.errorRateTarget ?? null : null
  let errorRateTargetSource = prior.errorRateTargetSource === "manual" ? "manual" : null
  if (errorRateTargetSource !== "manual") {
    const runsMain = runs.filter((r) => r.status !== "running" && (!main || r.job === main))
    const executed = runsMain.length || (count(history?.executed) ? history.executed : 0)
    const failed = runsMain.length ? runsMain.filter((r) => r.status === "failed").length : count(history?.failed) ? history.failed : 0
    if (executed >= minSamples) {
      errorRateTarget = Math.max(1, Math.ceil(((100 * failed) / executed) * 2) / 2)
      errorRateTargetSource = "baseline"
    } else if (appErrorRateTarget(report) !== null) {
      errorRateTarget = appErrorRateTarget(report)
      errorRateTargetSource = "app"
    }
  }
  return {
    owner: prior.owner || "",
    description: prior.description || text(report?.profile?.mainJob?.description, 300) || "",
    responseTargetMs: prior.responseTargetMs ?? null, clickTargetMs: prior.clickTargetMs ?? null,
    mainJob: prior.mainJobSource === "manual" ? prior.mainJob : text(report?.profile?.mainJob?.title, 200) || main || "",
    mainJobSource: prior.mainJobSource === "manual" ? "manual" : "auto",
    driver: prior.driver || { factor: "", unit: "" },
    errorRateTarget, errorRateTargetSource,
    minSamples: Number.isSafeInteger(prior.minSamples) && prior.minSamples > 0 ? prior.minSamples : minSamples,
    jobs,
    auto: true,
    detectedAt: new Date(now).toISOString(),
    detectedFrom: base.source,
  }
}

export const defaultResponseTargetMs = 2500
export const defaultClickTargetMs = 200

// User-facing latency (BA): P95 from performanceKpis against a per-tool target.
export function uxMetric(kpi, targetMs, minSamples = defaultMinSamples) {
  const samples = count(kpi?.samples) ? kpi.samples : 0
  const p95Ms = samples > 0 && Number.isFinite(kpi?.p95Ms) && kpi.p95Ms >= 0 ? kpi.p95Ms : null
  const status = p95Ms === null ? "nodata" : samples < minSamples ? "insufficient" : p95Ms > targetMs ? "bad" : "ok"
  return { p95Ms, samples, targetMs, status }
}

// Recent runs for the history tab, newest first. Child runs (parentRunId) are attached to their
// parent run so each run shows its sub-job breakdown; runs without a parent are listed on their own.
export function recentRuns(report, { limit = 50, mainJob = null } = {}) {
  const { runs } = parseRuns(report, { includeEstimated: true })
  const byId = new Map(runs.filter((r) => r.runId).map((r) => [r.runId, { ...r, steps: [] }]))
  const top = [], groups = new Map()
  for (const r of runs) {
    const parent = r.parentRunId && byId.get(r.parentRunId)
    if (parent && parent !== byId.get(r.runId)) parent.steps.push(r)
    else if (r.parentRunId && !parent) {
      // Children whose parent is not a measured run (e.g. a package with human approval between
      // steps) are grouped for display only; the group is never a job and has no measured time.
      const g = groups.get(r.parentRunId) || { job: null, group: true, runId: r.parentRunId, workload: r.workload, status: "success", startedAt: null, endedAt: null, steps: [] }
      g.steps.push(r)
      if (r.status === "failed") g.status = "failed"
      else if (r.status === "running" && g.status !== "failed") g.status = "running"
      if (r.startedAt !== null && (g.startedAt === null || r.startedAt < g.startedAt)) g.startedAt = r.startedAt
      const end = r.endedAt ?? r.startedAt
      if (end !== null && (g.endedAt === null || end > g.endedAt)) g.endedAt = end
      groups.set(r.parentRunId, g)
    } else top.push(r.runId && byId.has(r.runId) ? byId.get(r.runId) : { ...r, steps: [] })
  }
  top.push(...groups.values())
  const at = (r) => r.endedAt ?? r.startedAt ?? 0
  // With a Main Job, history lists its runs (sub-jobs appear inside them) and display groups, e.g. a
  // package still waiting for human approval; otherwise every run.
  const listed = mainJob && top.some((r) => r.job === mainJob)
    ? top.filter((r) => r.job === mainJob || (r.group && r.steps.some((x) => x.parent === mainJob)))
    : top
  return listed
    .sort((a, b) => at(b) - at(a))
    .slice(0, limit)
    .map((r) => ({
      ...r,
      // A display group shows the summed processing time of its steps, not wall-clock time.
      durationMs: r.group
        ? r.steps.reduce((sum, x) => (x.startedAt !== null && x.endedAt !== null ? sum + x.endedAt - x.startedAt : sum), 0) || null
        : r.startedAt !== null && r.endedAt !== null ? r.endedAt - r.startedAt : null,
      steps: r.steps.sort((a, b) => (a.startedAt ?? a.endedAt ?? 0) - (b.startedAt ?? b.endedAt ?? 0))
        .map((x) => ({ ...x, durationMs: x.startedAt !== null && x.endedAt !== null ? x.endedAt - x.startedAt : null })),
    }))
}

const ratio = (u) => (positive(u.targetMinutes) && Number.isFinite(u.p95Ms) ? u.p95Ms / (u.targetMinutes * 60000) : -1)
const worst = (units) => [...units].sort((a, b) => ratio(b) - ratio(a) || (b.samples || 0) - (a.samples || 0))[0] || null

// Evaluate one tool for a window. `result` is the monitoring read (may be missing).
// Failure-rate target (percent) an app may declare in profile-v1 as `errorRateTarget`, used when
// no admin target or baseline exists (e.g. fewer Main Job runs than the minimum sample count).
export function appErrorRateTarget(report) {
  const v = report?.profile?.errorRateTarget
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : null
}

export function evaluateTool({ id, name, tool, connected = true, result = null, days = 7, now = Date.now() }) {
  const config = tool || {}
  const minSamples = Number.isSafeInteger(config.minSamples) && config.minSamples > 0 ? config.minSamples : defaultMinSamples
  const report = result?.report || null
  const profile = report?.profile || null
  const errorTarget = config.errorRateTarget ?? appErrorRateTarget(report)
  const declared = Array.isArray(config.jobs) ? config.jobs : []
  const targetFor = (job) => {
    const own = declared.find((j) => j.name === job)
    if (own && positive(own.targetMinutes)) return own.targetMinutes
    return report ? jobCompletionTarget(report.appId, job, profile) : null
  }
  let measured = report ? jobUnitsFor(report, days, { now, targetFor }) : { source: null, units: [], outcomes: null }
  // When the selected period has no finished Main Job run, use the shortest wider window (30, then
  // 61 days, the jobRuns horizon) that has one, so the row still shows real metrics; the UI labels
  // the window. Only run-level data can be re-windowed.
  let windowDays = days
  const mainName = declared.find((j) => j.role === "main")?.name
  if (report && measured.source === "runs" && mainName && !measured.units.some((u) => u.job === mainName)) {
    for (const wider of [30, 61]) {
      if (wider <= days) continue
      const m = jobUnitsFor(report, wider, { now, targetFor })
      if (m.units.some((u) => u.job === mainName)) { measured = m; windowDays = wider; break }
    }
  }
  const withStatus = (u) => {
    const targetMinutes = targetFor(u.job)
    return { ...u, targetMinutes, status: timeStatus({ ...u, targetMinutes }, minSamples) }
  }
  const jobError = (job) => {
    const o = measured.outcomes?.get(job)
    if (!o) return null
    const target = errorTarget
    return { ...o, rate: o.executed ? (100 * o.failed) / o.executed : null, target, status: errorStatus({ ...o, target }, minSamples) }
  }

  // Declared/detected jobs keep their order and role; jobs the app reports later are added as
  // sub-jobs. A declared job without its own measurement is "unmeasured".
  const names = [...declared.map((j) => j.name)]
  for (const u of measured.units) if (!names.includes(u.job)) names.push(u.job)
  const jobs = names.map((n) => {
    const d = declared.find((j) => j.name === n) || { name: n, role: "sub", targetSource: null }
    const units = measured.units.filter((u) => u.job === n).map(withStatus)
    return { ...d, role: d.role || "sub", units, unmeasured: units.length === 0, error: jobError(n) }
  })
  const declaredMain = jobs.find((j) => j.role === "main")
  const allUnits = jobs.flatMap((j) => j.units.map((u) => ({ ...u, role: j.role })))
  const headline = declaredMain ? worst(declaredMain.units) : worst(allUnits)

  const outcomes = jobOutcomes(report, measured.outcomes, declaredMain?.name)
  const error = outcomes
    ? { ...outcomes, rate: outcomes.executed ? (100 * outcomes.failed) / outcomes.executed : null, target: errorTarget }
    : { executed: null, failed: null, timedOut: 0, rate: null, target: errorTarget, unverified: 0, complete: false }
  error.status = errorStatus(error, minSamples)
  // Displayed as a success rate (BA): success = 100% − failure rate; same counts and rules.
  const success = {
    executed: error.executed, succeeded: error.executed == null ? null : error.executed - error.failed,
    rate: error.rate == null ? null : 100 - error.rate, target: error.target == null ? null : 100 - error.target,
    status: error.status, timedOut: error.timedOut || 0, unverified: error.unverified || 0,
  }
  const kpis = report?.performanceKpis
  const response = uxMetric(kpis?.responseTime, positive(config.responseTargetMs) ? config.responseTargetMs : defaultResponseTargetMs, minSamples)
  const click = uxMetric(kpis?.clickLatency, positive(config.clickTargetMs) ? config.clickTargetMs : defaultClickTargetMs, minSamples)

  // Status uses the Main Job when there is one; sub-jobs feed the priority list.
  const scored = declaredMain ? declaredMain.units : allUnits
  const statuses = [...scored.map((u) => u.status), error.status]
  let status
  if (!connected || !report) status = "nodata"
  else if (statuses.includes("bad")) status = "bad"
  else if (statuses.every((s) => s === "nodata")) status = "nodata"
  else if (statuses.includes("notarget") || (declaredMain && declaredMain.unmeasured) || !scored.length) status = "notarget"
  else if (statuses.includes("insufficient")) status = "insufficient"
  else status = "ok"
  if (status === "ok" && !headline) status = "notarget"

  const reason = !connected
    ? "Chưa kết nối nguồn dữ liệu"
    : !report
      ? "Không đọc được báo cáo từ app"
      : status === "nodata"
        ? measured.source ? "Không có lần chạy nào kết thúc trong kỳ" : "App chưa gửi số liệu theo job"
        : null

  // The latest run, finished or not, headlines the row: the newest Main Job run or unscored group
  // (e.g. a package awaiting approval) in run history. An unfinished run shows its time so far.
  const history = report ? recentRuns(report, { mainJob: declaredMain?.name || null }) : []
  const top = history[0] || null
  const latest = top ? {
    workload: top.workload,
    state: top.status === "failed" ? "failed" : top.group || top.status === "running" ? "pending" : "success",
    durationMs: top.durationMs ?? (top.status === "running" && top.startedAt !== null ? Math.max(0, now - top.startedAt) : null),
    at: top.endedAt ?? top.startedAt,
  } : null

  return {
    id, name, connected, status, reason, minSamples, source: measured.source, latest, windowDays, widened: windowDays !== days,
    owner: config.owner || "", mainJob: config.mainJob || declaredMain?.name || (jobs.length === 1 ? jobs[0].name : ""),
    hasMain: Boolean(declaredMain), jobCount: jobs.length,
    // Shown when the period has no measured run: the Main Job's declared/detected target.
    mainTargetMinutes: declaredMain && positive(declaredMain.targetMinutes) ? declaredMain.targetMinutes : null,
    driver: config.driver || null, headline, jobs, error, success, response, click, appStatus: result?.status || null,
    description: config.description || "", reportedAt: report?.generatedAt || null,
    runs: history,
  }
}

// Optimisation priorities across tools (BA): slower-than-target jobs ranked by % over target,
// and failure rates over target ranked by failure count. Kept separate: they are not comparable.
export function priorities(evaluated) {
  const time = [], errors = []
  for (const t of evaluated) {
    if (!t.connected) continue
    for (const j of t.jobs) {
      for (const u of j.units)
        if (u.status === "bad")
          time.push({ toolId: t.id, tool: t.name, job: j.name, role: j.role, workload: u.workload, p95Ms: u.p95Ms,
            targetMinutes: u.targetMinutes, samples: u.samples, overRuns: u.overRuns,
            overPercent: (100 * (u.p95Ms - u.targetMinutes * 60000)) / (u.targetMinutes * 60000) })
      if (j.error?.status === "bad" && j.role !== "main")
        errors.push({ toolId: t.id, tool: t.name, job: j.name, failed: j.error.failed, executed: j.error.executed, rate: j.error.rate, target: j.error.target })
    }
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
