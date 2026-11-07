// Chart adapters preserve missing prices and never add historical and dispatcher ledgers.
export function modelSeries(report, source) {
  const rows =
    source === "ledger" ? report.ledger?.models || [] : report.ai?.models || []
  const groups = new Map()
  for (const row of rows) {
    const id =
      source === "ledger"
        ? [row.source || "workflow", row.provider, row.model]
            .filter(Boolean)
            .join(" / ")
        : row.model
    const item = groups.get(id) || {
      id,
      calls: 0,
      input: 0,
      cached: 0,
      output: 0,
      priced: 0,
      cost: null,
    }
    item.calls += Number(row.calls || 0)
    item.input +=
      Number(source === "ledger" ? row.input_tokens : row.inputTokens) || 0
    item.cached +=
      Number(
        source === "ledger" ? row.cached_input_tokens : row.cachedInputTokens,
      ) || 0
    item.output +=
      Number(source === "ledger" ? row.output_tokens : row.outputTokens) || 0
    item.priced +=
      Number(source === "ledger" ? row.priced_calls : row.pricedCalls) || 0
    const cost = source === "ledger" ? row.known_cost_usd : row.knownCostUsd
    if (cost != null && Number.isFinite(Number(cost)))
      item.cost = (item.cost ?? 0) + Number(cost)
    groups.set(id, item)
  }
  return [...groups.values()]
    .map((v) => ({
      ...v,
      cached: Math.min(v.input, v.cached),
      total: v.input + v.output,
    }))
    .sort((a, b) => b.total - a.total)
}
export function hourlySeries(timeline = []) {
  // Keep actual observation hours; gaps stay visible rather than becoming invented zeroes.
  return [...timeline]
    .filter((v) => Number.isFinite(Date.parse(v.hour)))
    .sort((a, b) => a.hour.localeCompare(b.hour))
}
export function responseShare(http) {
  const completed = Math.max(0, http.calls - (http.aborted || 0))
  return completed
    ? Math.max(0, Math.min(100, ((completed - http.failed) / completed) * 100))
    : null
}
export const statusTone = (status) =>
  /fail|reject|error/i.test(status)
    ? "bad"
    : /warning|pending|queued|running|progress|review|planning|brief|not_started|suggested/i.test(
          status,
        )
      ? "waiting"
      : /done|complete|approved|pass|ready|active|used/i.test(status)
        ? "good"
        : "other"

export function latencyDotPlot(http) {
  const points = [
    ["P50", http.p50Ms],
    ["P95", http.p95Ms],
    ["P99", http.p99Ms],
  ].map(([label, value]) => ({
    label,
    value: Number.isFinite(value) && value >= 0 ? value : null,
  }))
  const known = points.flatMap(({ value }) => value === null ? [] : [value])
  const valid = known.every((value, index) => index === 0 || value >= known[index - 1])
  const max = Math.max(1, ...known)
  const step = 10 ** Math.floor(Math.log10(max)) / 4
  const limit = Math.ceil(max / step) * step
  return { points, valid, hasSamples: known.length > 0, limit }
}

export function httpLatencyTimeline(report) {
  const hour = 3600000
  const day = 24 * hour
  const days = report.window?.days
  const end = Date.parse(report.generatedAt)
  const start = Math.floor(end / day) * day - (days - 1) * day
  if (![1, 7, 30].includes(days) || !Number.isFinite(start)) return []

  const step = days === 1 ? hour : day
  const periods = Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => ({
    time: start + i * step,
    calls: 0,
    totalMs: 0,
    complete: true,
  }))
  for (const row of report.timeline ?? []) {
    const time = Date.parse(row.hour)
    const period = periods[Math.floor((time - start) / step)]
    if (!period || time > end || !(row.calls > 0)) continue
    period.calls += row.calls
    if (Number.isFinite(row.httpTotalMs) && row.httpTotalMs >= 0)
      period.totalMs += row.httpTotalMs
    else period.complete = false
  }
  return periods.map(({ time, calls, totalMs, complete }) => ({
    time, calls, average: calls && complete ? totalMs / calls : null,
  }))
}
export function projectPerformanceMetrics(report) {
  const kpis = report.performanceKpis
  const duration = (value) =>
    Number.isFinite(value) && value >= 0 ? value : null
  const count = (value) => Number.isSafeInteger(value) && value >= 0
  const p95 = (metric) =>
    count(metric?.samples) && metric.samples > 0 ? duration(metric.p95Ms) : null
  const jobs = kpis?.jobs
  const rate = (numerator) =>
    count(jobs?.executed) && jobs.executed > 0 && count(numerator) && numerator <= jobs.executed
      ? 100 * numerator / jobs.executed
      : null

  return {
    responseMs: p95(kpis?.responseTime),
    clickMs: p95(kpis?.clickLatency),
    httpP95Ms: report.http?.calls > 0 ? duration(report.http.p95Ms) : null,
    executed: count(jobs?.executed) ? jobs.executed : null,
    errorRate: rate(jobs?.technicalErrors),
    successRate: rate(jobs?.validCompletions),
  }
}

export function projectJobHistoryMetrics(history) {
  if (!history) return null
  const { executed, failed, technicalErrors, unclassifiedFailures, validCompletions, unverifiedCompletions } = history
  const count = (value) => Number.isSafeInteger(value) && value >= 0
  if (![executed, failed, technicalErrors, unclassifiedFailures, validCompletions, unverifiedCompletions].every(count) ||
      technicalErrors + unclassifiedFailures > failed ||
      failed + validCompletions + unverifiedCompletions !== executed) return null
  const range = (low, unknown) => executed ? [100 * low / executed, 100 * (low + unknown) / executed] : null
  return {
    executed, technicalErrors, unclassifiedFailures, validCompletions, unverifiedCompletions,
    complete: history.complete === true,
    latestJob: typeof history.latestJob?.job === "string" && Number.isFinite(history.latestJob.durationMs) &&
      history.latestJob.durationMs >= 0 ? history.latestJob : null,
    errorRange: range(technicalErrors, unclassifiedFailures),
    successRange: range(validCompletions, unverifiedCompletions),
  }
}

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

// profile-v1: a connected app describes its own Performance sections. Everything is
// bounded and type-checked here; anything malformed is dropped, never guessed.
const text = (value, max = 200) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
const metricFormats = new Set(["number", "percent", "duration", "minutes", "text"])
const tones = new Set(["neutral", "success", "warning", "error"])
function profileMetric(raw) {
  const label = text(raw?.label, 80)
  if (!label) return null
  const format = metricFormats.has(raw.format) ? raw.format : "number"
  const value = raw.value === null ? null
    : format === "text" ? text(raw.value, 120)
    : Number.isFinite(raw.value) ? raw.value : undefined
  if (value === undefined) return null
  return { label, value, format, unit: text(raw.unit, 24), note: text(raw.note, 160),
    tone: tones.has(raw.tone) ? raw.tone : null }
}
const list = (value, max, map) =>
  Array.isArray(value) ? value.slice(0, max).map(map).filter((v) => v != null) : []
function profileTable(raw) {
  const columns = list(raw?.columns, 8, (c) => text(c, 60))
  if (!columns.length || columns.length !== raw.columns.length) return null
  const rows = list(raw.rows, 50, (row) =>
    Array.isArray(row) && row.length === columns.length &&
    row.every((cell) => cell === null || typeof cell === "string" || Number.isFinite(cell))
      ? row.map((cell) => (typeof cell === "string" ? cell.slice(0, 120) : cell))
      : null)
  return { columns, rows }
}
export function appProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.version !== "profile-v1") return null
  const jobTargets = {}
  for (const [job, minutes] of Object.entries(raw.jobTargets || {}).slice(0, 20))
    if (text(job, 80) && Number.isFinite(minutes) && minutes > 0) jobTargets[job] = minutes
  const inventoryLabels = {}
  for (const [key, label] of Object.entries(raw.inventoryLabels || {}).slice(0, 30))
    if (text(label, 80)) inventoryLabels[key] = text(label, 80)
  const mainJob = text(raw.mainJob?.title) ? {
    title: text(raw.mainJob.title),
    steps: list(raw.mainJob.steps, 8, (s) => text(s, 80)),
    metrics: list(raw.mainJob.metrics, 6, profileMetric),
    note: text(raw.mainJob.note, 240),
  } : null
  const sections = list(raw.sections, 8, (section) => {
    const title = text(section?.title, 100)
    if (!title) return null
    const metrics = list(section.metrics, 12, profileMetric)
    const table = section.table ? profileTable(section.table) : null
    if (!metrics.length && !table) return null
    return { id: text(section.id, 64) || title, title, description: text(section.description, 240), metrics, table }
  })
  return { jobTargets, inventoryLabels, mainJob, sections }
}
