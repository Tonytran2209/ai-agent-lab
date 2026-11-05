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

// Smooth horizontal-tangent segments cannot overshoot monotone percentile samples.
// The x axis is categorical (P50/P95/P99), never a timeline or interpolated percentile scale.
export function latencyCurve(http) {
  const samples = [
    ["P50", http.p50Ms],
    ["P95", http.p95Ms],
    ["P99", http.p99Ms],
  ]
  const known = samples.filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  )
  if (!known.length) return { points: [], path: "", ticks: [], valid: true }
  if (known.some(([, v], i) => i > 0 && v < known[i - 1][1]))
    return { points: [], path: "", ticks: [], valid: false }
  const max = Math.max(...known.map(([, v]) => v), 1),
    step = 10 ** Math.floor(Math.log10(max)) / 4
  const top = Math.ceil((max * 1.15) / step) * step
  const points = samples.map(([label, value], i) => ({
    label,
    value,
    x: 80 + i * 230,
    y:
      typeof value === "number" && Number.isFinite(value) && value >= 0
        ? 176 - (value / top) * 144
        : null,
  }))
  let path = ""
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.y === null) continue
    const previous = points[i - 1]
    if (!previous || previous.y === null) path += ` M ${p.x} ${p.y}`
    else {
      const dx = (p.x - previous.x) / 3
      path += ` C ${previous.x + dx} ${previous.y}, ${p.x - dx} ${p.y}, ${p.x} ${p.y}`
    }
  }
  return {
    points,
    path,
    ticks: [0, 0.5, 1].map((f) => ({ value: top * f, y: 176 - 144 * f })),
    valid: true,
  }
}
