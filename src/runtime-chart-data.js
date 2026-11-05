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
