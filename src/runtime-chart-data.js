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
  const completion = Array.isArray(kpis?.jobCompletion)
    ? kpis.jobCompletion.filter((row) =>
        typeof row?.job === "string" && row.job.trim() &&
        typeof row.workload === "string" && row.workload.trim() && p95(row) !== null,
      )
    : []

  return {
    responseMs: p95(kpis?.responseTime),
    clickMs: p95(kpis?.clickLatency),
    httpP95Ms: report.http?.calls > 0 ? duration(report.http.p95Ms) : null,
    completion,
    executed: count(jobs?.executed) ? jobs.executed : null,
    errorRate: rate(jobs?.technicalErrors),
    successRate: rate(jobs?.validCompletions),
  }
}

export function combinedProjectJobMetrics(targets, field = "jobHistory") {
  const count = (value) => Number.isSafeInteger(value) && value >= 0
  const cohorts = targets.flatMap(({ name, report }) => {
    const history = report?.[field]
    if (!history) return []
    const { executed, failed, technicalErrors, unclassifiedFailures, validCompletions, unverifiedCompletions } = history
    if (![executed, failed, technicalErrors, unclassifiedFailures, validCompletions, unverifiedCompletions].every(count) ||
        technicalErrors + unclassifiedFailures > failed ||
        failed + validCompletions + unverifiedCompletions !== executed) return []
    return [{ name, ...history }]
  })
  const totals = cohorts.reduce((sum, row) => {
    for (const key of Object.keys(sum)) sum[key] += row[key]
    return sum
  }, { executed: 0, failed: 0, technicalErrors: 0, unclassifiedFailures: 0, validCompletions: 0, unverifiedCompletions: 0 })
  const rate = (low, unknown) => totals.executed
    ? [100 * low / totals.executed, 100 * (low + unknown) / totals.executed]
    : null
  return {
    ...totals,
    coverage: cohorts.length,
    complete: cohorts.length === targets.length && cohorts.every((row) => row.complete === true),
    completion: cohorts.flatMap(({ name, completion }) =>
      projectPerformanceMetrics({ performanceKpis: { jobCompletion: completion } })
        .completion.map((row) => ({ ...row, job: name ? name + " · " + row.job : row.job })),
    ),
    errorRange: rate(totals.technicalErrors, totals.unclassifiedFailures),
    successRange: rate(totals.validCompletions, totals.unverifiedCompletions),
  }
}
