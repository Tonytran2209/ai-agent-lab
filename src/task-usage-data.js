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
