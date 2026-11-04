// Read-only targets are separate from Lab project execution/release permissions.
export function monitoringTargets(
  raw = process.env.LAB_MONITORING_TARGETS || "[]",
) {
  const targets = JSON.parse(raw)
  if (!Array.isArray(targets) || targets.length > 12)
    throw new Error("Invalid monitoring configuration")
  const ids = new Set()
  return targets.map((t) => {
    const url = new URL(t.origin)
    if (
      !/^[a-z0-9-]{2,64}$/.test(t.id) ||
      ids.has(t.id) ||
      typeof t.name !== "string" ||
      t.name.length > 100 ||
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".up.railway.app") ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      typeof t.token !== "string" ||
      t.token.length < 32
    )
      throw new Error("Invalid monitoring target")
    ids.add(t.id)
    return {
      id: t.id,
      name: t.name,
      origin: url.origin,
      token: t.token,
      appId: t.appId,
    }
  })
}
export function createAppMonitoring({
  targets = () => monitoringTargets(),
  fetcher = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map()
  async function read(target, days) {
    const key = target.id + ":" + days,
      prior = cache.get(key)
    if (prior && prior.until > now()) return prior.promise
    const promise = (async () => {
      const base = { id: target.id, name: target.name, origin: target.origin }
      try {
        const start = now()
        const response = await fetcher(
          target.origin + "/internal/monitoring?days=" + days,
          {
            headers: {
              Authorization: "Bearer " + target.token,
              Accept: "application/json",
            },
            redirect: "error",
            signal: AbortSignal.timeout(12000),
          },
        )
        if (!response.ok) {
          await response.body?.cancel()
          return {
            ...base,
            status: response.status === 401 ? "unauthorized" : "unavailable",
            report: null,
          }
        }
        const reader = response.body.getReader()
        let size = 0
        const chunks = []
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > 2 * 1024 * 1024) throw new Error("oversize")
            chunks.push(Buffer.from(value))
          }
        } finally {
          await reader.cancel().catch(() => {})
        }
        const report = JSON.parse(Buffer.concat(chunks).toString("utf8"))
        if (
          report.protocol !== "app-monitoring-v1" ||
          report.appId !== target.appId ||
          report.window?.days !== days ||
          !Number.isFinite(Date.parse(report.generatedAt)) ||
          Math.abs(now() - Date.parse(report.generatedAt)) > 120000 ||
          !report.http ||
          !report.ai ||
          !report.runtime
        )
          throw new Error("Invalid report")
        return {
          ...base,
          status: report.database?.status === "ready" ? "ready" : "degraded",
          fetchMs: now() - start,
          report,
        }
      } catch {
        return { ...base, status: "unavailable", report: null }
      }
    })()
    cache.set(key, { until: now() + 30000, promise })
    if (cache.size > 360) cache.clear()
    return promise
  }
  return {
    async snapshot(days) {
      let configured
      try {
        configured = targets()
      } catch {
        return {
          generatedAt: new Date(now()).toISOString(),
          targets: [],
          configurationError: true,
        }
      }
      return {
        generatedAt: new Date(now()).toISOString(),
        targets: await Promise.all(configured.map((t) => read(t, days))),
      }
    },
  }
}
