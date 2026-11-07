import crypto from "node:crypto"
import net from "node:net"
import { z } from "zod"
import { fail } from "./schemas.js"

// Read-only monitoring targets are separate from Lab project execution/release permissions.
export const maxMonitoringTargets = 12
const idPattern = /^[a-z0-9-]{2,64}$/

// Public HTTPS origin only: no credentials, port, path, query, IP literal or local/internal name.
export function monitoringOrigin(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    net.isIP(host.replace(/^\[|\]$/g, "")) ||
    !host.includes(".") ||
    /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host) ||
    host.endsWith(".railway.internal")
  )
    return null
  return url.origin
}

function checkTarget(t) {
  const origin = monitoringOrigin(t?.origin)
  if (
    !origin ||
    !idPattern.test(t.id) ||
    typeof t.name !== "string" ||
    !t.name.trim() ||
    t.name.length > 100 ||
    typeof t.appId !== "string" ||
    !t.appId ||
    t.appId.length > 64 ||
    typeof t.token !== "string" ||
    t.token.length < 32 ||
    t.token.length > 512
  )
    throw new Error("Invalid monitoring target")
  return { id: t.id, name: t.name.trim(), origin, token: t.token, appId: t.appId }
}

// Legacy/bootstrap configuration from LAB_MONITORING_TARGETS (read-only in the UI).
export function monitoringTargets(raw = process.env.LAB_MONITORING_TARGETS || "[]") {
  const targets = JSON.parse(raw)
  if (!Array.isArray(targets) || targets.length > maxMonitoringTargets)
    throw new Error("Invalid monitoring configuration")
  const ids = new Set()
  return targets.map((t) => {
    const target = checkTarget(t)
    if (ids.has(target.id)) throw new Error("Invalid monitoring target")
    ids.add(target.id)
    return target
  })
}

const slug = (name) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)

const inputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    origin: z.string().trim().max(300),
    appId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/),
    token: z.string().min(32).max(512).optional(),
  })
  .strict()
const probeSchema = z
  .object({
    id: z.string().regex(idPattern).optional(),
    origin: z.string().trim().max(300).optional(),
    token: z.string().min(32).max(512).optional(),
  })
  .strict()

// Admin-managed targets stored in SQLite. Tokens are AES-256-GCM sealed and never returned.
export function createMonitoringRegistry(db, config, { clock = () => Date.now() } = {}) {
  const key = crypto
    .createHash("sha256")
    .update("lab-monitoring-v1:" + (config.LAB_MONITORING_ENCRYPTION_KEY || config.SESSION_SECRET || ""))
    .digest()
  const seal = (value) => {
    const iv = crypto.randomBytes(12),
      c = crypto.createCipheriv("aes-256-gcm", key, iv)
    return [iv.toString("hex"), c.update(value, "utf8", "hex") + c.final("hex"), c.getAuthTag().toString("hex")].join(".")
  }
  const open = (value) => {
    const [iv, cipher, tag] = String(value).split(".")
    const c = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"))
    c.setAuthTag(Buffer.from(tag, "hex"))
    return c.update(cipher, "hex", "utf8") + c.final("utf8")
  }
  const read = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key='monitoring-targets-v1'").get()
    return row ? JSON.parse(row.value) : []
  }
  const write = (list) =>
    db
      .prepare("INSERT INTO settings(key,value) VALUES ('monitoring-targets-v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(JSON.stringify(list))
  const env = () => {
    try {
      return { targets: monitoringTargets(config.LAB_MONITORING_TARGETS || "[]"), error: false }
    } catch {
      return { targets: [], error: true }
    }
  }
  const unseal = (t) => {
    try {
      return open(t.token)
    } catch {
      return null
    }
  }
  const origin = (value) => monitoringOrigin(value) || fail("Địa chỉ phải là HTTPS công khai, chỉ gồm domain (ví dụ https://app.up.railway.app).")

  return {
    // Targets used by the dashboard: stored first, then environment entries with other ids.
    targets() {
      const stored = read()
        .map((t) => ({ ...t, token: unseal(t) }))
        .filter((t) => t.token)
        .map((t) => ({ id: t.id, name: t.name, origin: t.origin, appId: t.appId, token: t.token }))
      const ids = new Set(stored.map((t) => t.id))
      return [...stored, ...env().targets.filter((t) => !ids.has(t.id))].slice(0, maxMonitoringTargets)
    },
    list() {
      const stored = read()
      const ids = new Set(stored.map((t) => t.id))
      const fromEnv = env()
      return {
        max: maxMonitoringTargets,
        environmentError: fromEnv.error,
        targets: [
          ...stored.map((t) => ({
            id: t.id, name: t.name, origin: t.origin, appId: t.appId, source: "settings",
            tokenReadable: unseal(t) !== null, createdAt: t.createdAt, updatedAt: t.updatedAt, updatedBy: t.updatedBy,
          })),
          ...fromEnv.targets
            .filter((t) => !ids.has(t.id))
            .map((t) => ({ id: t.id, name: t.name, origin: t.origin, appId: t.appId, source: "environment", tokenReadable: true })),
        ],
      }
    },
    add(input, actor) {
      const v = inputSchema.parse(input)
      if (!v.token) fail("Cần token monitoring của ứng dụng (tối thiểu 32 ký tự).")
      const list = read(),
        all = this.list().targets
      if (all.length >= maxMonitoringTargets) fail("Đã đạt tối đa " + maxMonitoringTargets + " ứng dụng monitoring.")
      const base = slug(v.name) || "app"
      let id = base.length >= 2 ? base : base + "-app",
        n = 2
      while (all.some((t) => t.id === id)) id = (base.slice(0, 60) + "-" + n++).slice(0, 64)
      const at = new Date(clock()).toISOString()
      const target = { id, name: v.name, origin: origin(v.origin), appId: v.appId, token: seal(v.token), createdAt: at, updatedAt: at, updatedBy: actor }
      write([...list, target])
      return this.list()
    },
    update(id, input, actor) {
      const v = inputSchema.parse(input),
        list = read(),
        index = list.findIndex((t) => t.id === id)
      if (index < 0) fail("Chỉ sửa được ứng dụng đã thêm trong Cài đặt.")
      const old = list[index],
        nextOrigin = origin(v.origin)
      if (nextOrigin !== old.origin && !v.token) fail("Đổi địa chỉ cần nhập lại token.")
      if (!v.token && unseal(old) === null) fail("Token cũ không còn giải mã được; nhập token mới.")
      list[index] = {
        ...old, name: v.name, origin: nextOrigin, appId: v.appId,
        token: v.token ? seal(v.token) : old.token, updatedAt: new Date(clock()).toISOString(), updatedBy: actor,
      }
      write(list)
      return this.list()
    },
    remove(id) {
      const list = read()
      if (!list.some((t) => t.id === id))
        fail(this.list().targets.some((t) => t.id === id)
          ? "Ứng dụng này cấu hình qua LAB_MONITORING_TARGETS; xóa trong biến môi trường Railway."
          : "Không tìm thấy ứng dụng.")
      write(list.filter((t) => t.id !== id))
      return this.list()
    },
    // Resolve what to probe: a new origin/token, or a saved target (optionally with a new token).
    probeTarget(input) {
      const v = probeSchema.parse(input)
      const saved = v.id ? this.targets().find((t) => t.id === v.id) : null
      if (v.id && !saved && !v.token) fail("Không đọc được token đã lưu; nhập token mới.")
      const target = { id: v.id || "probe", name: saved?.name || "probe", origin: origin(v.origin || saved?.origin), token: v.token || saved?.token }
      if (!target.token) fail("Cần token để kiểm tra.")
      if (saved && target.origin !== saved.origin && !v.token) fail("Đổi địa chỉ cần nhập lại token.")
      return target
    },
  }
}

const sectionsOf = (report) =>
  ["profile", "jobHistory", "jobHistoryAllTime", "performanceKpis", "http", "ai", "runtime", "database", "inventory", "contentWorkload"].filter(
    (k) => report[k] != null,
  )

export function createAppMonitoring({
  targets = () => monitoringTargets(),
  fetcher = fetch,
  now = Date.now,
} = {}) {
  let cache = new Map()
  // One bounded, authenticated, no-redirect read. `expectedAppId` null accepts any app id (probe).
  async function fetchReport(target, days, expectedAppId) {
    const base = { id: target.id, name: target.name, origin: target.origin }
    try {
      const start = now()
      const response = await fetcher(target.origin + "/internal/monitoring?days=" + days, {
        headers: { Authorization: "Bearer " + target.token, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) {
        await response.body?.cancel()
        return {
          ...base,
          status: response.status === 401 ? "unauthorized" : response.status === 404 ? "not-found" : "unavailable",
          httpStatus: response.status,
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
        typeof report.appId !== "string" ||
        (expectedAppId != null && report.appId !== expectedAppId) ||
        report.window?.days !== days ||
        !Number.isFinite(Date.parse(report.generatedAt)) ||
        Math.abs(now() - Date.parse(report.generatedAt)) > 120000 ||
        // http/ai/runtime are optional: an app without AI or HTTP telemetry still reports its own profile.
        ["http", "ai", "runtime", "profile"].some(
          (k) => report[k] != null && (typeof report[k] !== "object" || Array.isArray(report[k])),
        ) ||
        !(report.http || report.ai || report.runtime || report.profile)
      )
        return { ...base, status: "invalid", reportedAppId: typeof report?.appId === "string" ? report.appId.slice(0, 64) : null, report: null }
      return {
        ...base,
        status: report.database?.status === "ready" ? "ready" : "degraded",
        fetchMs: now() - start,
        report,
      }
    } catch {
      return { ...base, status: "unavailable", report: null }
    }
  }
  function read(target, days) {
    const key = [target.id, target.origin, target.appId, crypto.createHash("sha256").update(target.token).digest("hex"), days].join(":"),
      prior = cache.get(key)
    if (prior && prior.until > now()) return prior.promise
    const promise = fetchReport(target, days, target.appId).then(({ reportedAppId, httpStatus, ...result }) =>
      result.status === "invalid" || result.status === "not-found" ? { ...result, status: "unavailable" } : result,
    )
    cache.set(key, { until: now() + 30000, promise })
    if (cache.size > 360) cache = new Map()
    return promise
  }
  return {
    async snapshot(days) {
      let configured
      try {
        configured = targets()
      } catch {
        return { generatedAt: new Date(now()).toISOString(), targets: [], configurationError: true }
      }
      return {
        generatedAt: new Date(now()).toISOString(),
        targets: await Promise.all(configured.map((t) => read(t, days))),
      }
    },
    // Connection test for Settings: never cached, never returns the report body or the token.
    async probe(target) {
      const result = await fetchReport(target, 1, null)
      return {
        status: result.status,
        httpStatus: result.httpStatus ?? null,
        appId: result.report?.appId ?? result.reportedAppId ?? null,
        fetchMs: result.fetchMs ?? null,
        sections: result.report ? sectionsOf(result.report) : [],
        profileTitle: typeof result.report?.profile?.mainJob?.title === "string" ? result.report.profile.mainJob.title.slice(0, 100) : null,
      }
    },
    clear() {
      cache = new Map()
    },
  }
}
