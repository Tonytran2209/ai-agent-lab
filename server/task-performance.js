export function usageFields(usage) {
  const valid = (v) => Number.isSafeInteger(v) && v >= 0
  if (!usage || !valid(usage.total_tokens)) return null
  const input = valid(usage.input_tokens) ? usage.input_tokens : null,
    output = valid(usage.output_tokens) ? usage.output_tokens : null
  const cached =
    usage.input_tokens_details?.cached_tokens ?? usage.cached_tokens
  return {
    total_tokens: usage.total_tokens,
    input_tokens: input,
    output_tokens: output,
    cached_tokens:
      valid(cached) && input !== null ? Math.min(input, cached) : null,
  }
}
export function estimatedCost(model, usage, config = {}) {
  try {
    const p = JSON.parse(config.LAB_AI_MODEL_PRICING || "{}")[model]
    if (
      !p ||
      !usage ||
      usage.input_tokens == null ||
      usage.output_tokens == null
    )
      return null
    const rates = [
      p.inputUsdPerMillion,
      p.outputUsdPerMillion,
      p.cachedInputUsdPerMillion ?? p.inputUsdPerMillion,
    ]
    if (
      rates.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)
    )
      return null
    if (usage.cached_tokens == null && rates[2] !== rates[0]) return null
    const cached = usage.cached_tokens ?? 0
    return (
      ((usage.input_tokens - cached) * rates[0] +
        cached * rates[2] +
        usage.output_tokens * rates[1]) /
      1e6
    )
  } catch {
    return null
  }
}
export function requestTaskUsage(db, requests, config = {}) {
  const byId = new Map(
    requests.map((r) => [
      r.id,
      {
        id: r.id,
        entityId: r.projectId,
        kind: "lab-request",
        label: r.title || r.id,
        status:
          r.status === "completed"
            ? "completed"
            : r.status === "failed"
              ? "failed"
              : "running",
        startedAt: r.createdAt,
        finishedAt: r.status === "completed" ? r.updatedAt : null,
        calls: 0,
        failedCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 0,
        usageSamples: 0,
        breakdownSamples: 0,
        cachedSamples: 0,
        pricedCalls: 0,
        knownCostUsd: null,
        details: [],
        detailTruncated: false,
      },
    ]),
  )
  let incomplete = false
  for (const table of ["agent_usage", "ai_attempts"]) {
    if (
      !db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table)
    )
      continue
    const stored = []
    const ids = [...byId.keys()]
    for (let offset = 0; offset < ids.length; offset += 400) {
      const chunk = ids.slice(offset, offset + 400)
      stored.push(
        ...db
          .prepare(
            `SELECT data FROM ${table} WHERE ${
              table === "agent_usage"
                ? "json_extract(data,'$.requestId')"
                : "request_id"
            } IN (${chunk.map(() => "?").join(",")}) ORDER BY day DESC LIMIT ?`,
          )
          .all(...chunk, Math.max(1, 10001 - stored.length)),
      )
      if (stored.length > 10000) break
    }
    if (stored.length > 10000) incomplete = true
    for (const item of stored.slice(0, 10000)) {
      let e
      try {
        e = JSON.parse(item.data)
      } catch {
        incomplete = true
        continue
      }
      const row = byId.get(e.requestId)
      if (!row) continue
      row.calls++
      row.failedCalls += Number((e.state || e.status) === "failed")
      const u =
        usageFields(e.usage) ||
        (Number.isSafeInteger(e.tokens)
          ? {
              total_tokens: e.tokens,
              input_tokens: null,
              output_tokens: null,
              cached_tokens: null,
            }
          : null)
      if (u) {
        row.totalTokens += u.total_tokens
        row.inputTokens += u.input_tokens ?? 0
        row.outputTokens += u.output_tokens ?? 0
        row.cachedInputTokens += u.cached_tokens ?? 0
        row.usageSamples++
        if (u.input_tokens !== null && u.output_tokens !== null)
          row.breakdownSamples++
        if (u.cached_tokens !== null) row.cachedSamples++
      }
      const cost =
        typeof e.costUsd === "number" &&
        Number.isFinite(e.costUsd) &&
        e.costUsd >= 0
          ? e.costUsd
          : null
      if (cost !== null) {
        row.knownCostUsd = (row.knownCostUsd ?? 0) + cost
        row.pricedCalls++
      }
      if (row.details.length < 30)
        row.details.push({
          model: e.model,
          status: e.state || e.status,
          totalTokens: u?.total_tokens ?? null,
          inputTokens: u?.input_tokens ?? null,
          outputTokens: u?.output_tokens ?? null,
          cachedInputTokens: u?.cached_tokens ?? null,
          costUsd: cost,
          kind: e.kind || "legacy-planning",
        })
      else row.detailTruncated = true
    }
  }
  return {
    version: "task-usage-v1",
    rows: [...byId.values()]
      .filter((v) => v.calls > 0)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 1000)
      .map((v, i) => ({
        ...v,
        inputTokens: v.breakdownSamples === v.calls ? v.inputTokens : null,
        outputTokens: v.breakdownSamples === v.calls ? v.outputTokens : null,
        cachedInputTokens:
          v.cachedSamples === v.calls ? v.cachedInputTokens : null,
        details: i < 50 ? v.details.slice(0, 10) : [],
        detailTruncated: v.detailTruncated || v.details.length > 10 || i >= 50,
      })),
    complete:
      !incomplete &&
      [...byId.values()].filter((v) => v.calls > 0).length <= 1000,
    coverage:
      "API calls recorded by Lab only; excludes Codex CLI/ChatGPT subscription consumption. Task cohort uses request creation date.",
  }
}
