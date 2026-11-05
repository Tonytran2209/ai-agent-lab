export function taskRows(report, historical = false) {
  const rows = historical
    ? report?.historicalTasks || []
    : report?.taskUsage?.rows || []
  return rows.map((r) => {
    const total = r.totalTokens ?? (r.inputTokens || 0) + (r.outputTokens || 0),
      legacy = historical
    const calls = legacy ? 1 : r.calls
    const usage = legacy ? (total > 0 ? 1 : 0) : r.usageSamples
    const priced = legacy ? (r.knownCostUsd != null ? 1 : 0) : r.pricedCalls
    return {
      ...r,
      id: String(r.id),
      calls,
      usageSamples: usage,
      pricedCalls: priced,
      totalTokens: total,
      tokenComplete: usage === calls && calls > 0,
      costComplete: priced === calls && calls > 0,
      knownCostUsd: r.knownCostUsd ?? null,
      details: r.details || [],
      historical: legacy,
    }
  })
}
export function taskSummary(rows) {
  const finished = rows.filter((r) => r.status === "completed"),
    tokens = finished.filter((r) => r.tokenComplete),
    priced = finished.filter((r) => r.costComplete)
  return {
    count: rows.length,
    completed: finished.length,
    tokenSamples: tokens.length,
    costSamples: priced.length,
    averageTokens: tokens.length
      ? tokens.reduce((s, r) => s + r.totalTokens, 0) / tokens.length
      : null,
    averageUsd: priced.length
      ? priced.reduce((s, r) => s + r.knownCostUsd, 0) / priced.length
      : null,
    partial: rows.filter((r) => !r.tokenComplete || !r.costComplete).length,
  }
}
export function rankedTasks(rows, sort = "cost") {
  return [...rows].sort((a, b) =>
    sort === "tokens"
      ? b.totalTokens - a.totalTokens
      : (b.knownCostUsd ?? -1) - (a.knownCostUsd ?? -1) ||
        b.totalTokens - a.totalTokens,
  )
}

export function taskTimeline(rows, report) {
  const day = 86400000
  const end = Date.parse(report.generatedAt)
  const days = report.window?.days ?? report.days
  const start = Math.floor(end / day) * day - (days - 1) * day
  if (!Number.isFinite(start) || days < 1) return []

  const step = day * (days === 1 ? 1 / 6 : Math.ceil(days / 7))
  const periods = Array.from(
    { length: Math.floor((end - start) / step) + 1 },
    (_, i) => ({
      start: start + i * step,
      end: Math.min(start + (i + 1) * step - 1, end),
      count: 0,
      tokens: null,
      usd: null,
      partialTokens: false,
      partialUsd: false,
    }),
  )

  for (const row of rows) {
    const time = Date.parse(row.startedAt)
    const period = periods[Math.floor((time - start) / step)]
    if (!period || time > end) continue
    period.count += row.count ?? 1
    if (row.usageSamples > 0) period.tokens = (period.tokens ?? 0) + row.totalTokens
    if (row.knownCostUsd != null) period.usd = (period.usd ?? 0) + row.knownCostUsd
    period.partialTokens ||= !row.tokenComplete
    period.partialUsd ||= !row.costComplete
  }
  return periods
}
