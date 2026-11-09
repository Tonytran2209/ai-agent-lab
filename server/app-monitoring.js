import crypto from "node:crypto"
import net from "node:net"
import { z } from "zod"
import { fail } from "./schemas.js"
import { detectToolProfile, reportJobNames } from "./tool-performance.js"
import { railwayBinding } from "./deploy-onboarding.js"

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

// tool-config-v2: the tool profile. Detected from the app's real report (auto) and stored with
// provenance per value; values with source "manual" are admin overrides kept across re-detection.
const shortText = (max) => z.string().trim().max(max)
const source = z.enum(["auto", "manual"])
const targetSource = z.enum(["app", "builtin", "baseline", "manual"]).nullable()
export const toolConfigSchema = z
  .object({
    owner: shortText(100).default(""),
    description: shortText(300).default(""),
    responseTargetMs: z.number().positive().max(600000).nullable().default(null),
    clickTargetMs: z.number().positive().max(60000).nullable().default(null),
    mainJob: shortText(200).default(""),
    mainJobSource: source.default("auto"),
    driver: z.object({ factor: shortText(100).default(""), unit: shortText(40).default("") }).strict().default({}),
    errorRateTarget: z.number().min(0).max(100).nullable().default(null),
    errorRateTargetSource: z.enum(["baseline", "app", "manual"]).nullable().default(null),
    minSamples: z.number().int().min(1).max(1000).default(20),
    auto: z.boolean().default(true),
    detectedAt: z.string().datetime().nullable().default(null),
    detectedFrom: z.string().max(20).nullable().default(null),
    jobs: z
      .array(
        z
          .object({
            name: shortText(100).min(1),
            role: z.enum(["main", "sub"]).default("sub"),
            roleSource: source.default("auto"),
            startEvent: shortText(200).default(""),
            endEvent: shortText(200).default(""),
            successCondition: shortText(200).default(""),
            targetMinutes: z.number().positive().max(100000).nullable().default(null),
            targetSource: targetSource.default(null),
            baselineP95Ms: z.number().nonnegative().nullable().default(null),
            baselineSamples: z.number().int().nonnegative().default(0),
            workloads: z.array(shortText(100)).max(10).default([]),
            parent: shortText(100).nullable().default(null),
            perItem: z.boolean().default(false),
          })
          .strict(),
      )
      .max(20)
      .default([])
      .refine((jobs) => jobs.filter((j) => j.role === "main").length <= 1, "Chỉ được có một Main Job.")
      .refine((jobs) => new Set(jobs.map((j) => j.name)).size === jobs.length, "Tên job không được trùng."),
  })
  .strict()
const inputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    // A tool can be declared before its data source exists (BA: "No data" until the first run).
    origin: z.string().trim().max(300).optional().default(""),
    appId: z.string().trim().max(64).regex(/^[A-Za-z0-9._:-]*$/).optional().default(""),
    token: z.string().min(32).max(512).optional(),
    tool: toolConfigSchema.optional(),
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
  // Detected profiles of tools configured in LAB_MONITORING_TARGETS live here, keyed by tool id;
  // tools added in Settings keep theirs on their own entry.
  const readProfiles = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key='monitoring-profiles-v1'").get()
    return row ? JSON.parse(row.value) : {}
  }
  const writeProfiles = (map) =>
    db
      .prepare("INSERT INTO settings(key,value) VALUES ('monitoring-profiles-v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(JSON.stringify(map))
  // Optional Railway link per tool (deploy events) and Tech/Lead optimisation decisions.
  const readKey = (key, fallback) => {
    const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key)
    return row ? JSON.parse(row.value) : fallback
  }
  const writeKey = (key, value) =>
    db.prepare("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value))
  const env = () => {
    try {
      return { targets: monitoringTargets(config.LAB_MONITORING_TARGETS || "[]"), error: false }
    } catch {
      return { targets: [], error: true }
    }
  }
  const unseal = (t) => {
    if (!t.token) return null
    try {
      return open(t.token)
    } catch {
      return null
    }
  }
  const origin = (value) => monitoringOrigin(value) || fail("Địa chỉ phải là HTTPS công khai, chỉ gồm domain (ví dụ https://app.up.railway.app).")

  // Data source is optional: none (declared only) or origin + appId + token. A saved token never follows a new host.
  const connection = (v, old) => {
    if (!v.origin) {
      if (v.token) fail("Nhập địa chỉ ứng dụng cho token này.")
      return { origin: null, appId: null, token: null }
    }
    const nextOrigin = origin(v.origin)
    if (!v.appId) fail("Cần App ID; bấm Kiểm tra kết nối để tự điền.")
    if (!v.token) {
      if (!old?.token) fail("Cần token monitoring của ứng dụng (tối thiểu 32 ký tự).")
      if (nextOrigin !== old.origin) fail("Đổi địa chỉ cần nhập lại token.")
      if (unseal(old) === null) fail("Token cũ không còn giải mã được; nhập token mới.")
    }
    return { origin: nextOrigin, appId: v.appId, token: v.token ? seal(v.token) : old.token }
  }
  return {
    // Targets used by the dashboard: stored first, then environment entries with other ids.
    targets() {
      const stored = read()
        .filter((t) => t.origin)
        .map((t) => ({ ...t, token: unseal(t) }))
        .filter((t) => t.token)
        .map((t) => ({ id: t.id, name: t.name, origin: t.origin, appId: t.appId, token: t.token }))
      const ids = new Set(stored.map((t) => t.id))
      return [...stored, ...env().targets.filter((t) => !ids.has(t.id))].slice(0, maxMonitoringTargets)
    },
    list() {
      const stored = read()
      const ids = new Set(stored.map((t) => t.id))
      const fromEnv = env(),
        profiles = readProfiles(),
        railway = readKey("monitoring-railway-v1", {})
      const link = (id) => (railway[id] ? { url: railway[id].url } : null)
      return {
        max: maxMonitoringTargets,
        environmentError: fromEnv.error,
        targets: [
          ...stored.map((t) => ({
            id: t.id, name: t.name, origin: t.origin || null, appId: t.appId || null, source: "settings",
            connected: Boolean(t.origin), tokenReadable: !t.origin || unseal(t) !== null, tool: t.tool || null, railway: link(t.id), createdAt: t.createdAt, updatedAt: t.updatedAt, updatedBy: t.updatedBy,
          })),
          ...fromEnv.targets
            .filter((t) => !ids.has(t.id))
            .map((t) => ({ id: t.id, name: t.name, origin: t.origin, appId: t.appId, source: "environment", connected: true, tokenReadable: true, tool: profiles[t.id] || null, railway: link(t.id) })),
        ],
      }
    },
    add(input, actor) {
      const v = inputSchema.parse(input)
      const source = connection(v, null)
      const list = read(),
        all = this.list().targets
      if (all.length >= maxMonitoringTargets) fail("Đã đạt tối đa " + maxMonitoringTargets + " ứng dụng monitoring.")
      const base = slug(v.name) || "app"
      let id = base.length >= 2 ? base : base + "-app",
        n = 2
      while (all.some((t) => t.id === id)) id = (base.slice(0, 60) + "-" + n++).slice(0, 64)
      const at = new Date(clock()).toISOString()
      const target = { id, name: v.name, ...source, tool: v.tool || null, createdAt: at, updatedAt: at, updatedBy: actor }
      write([...list, target])
      return this.list()
    },
    update(id, input, actor) {
      const v = inputSchema.parse(input),
        list = read(),
        index = list.findIndex((t) => t.id === id)
      if (index < 0) fail("Chỉ sửa được ứng dụng đã thêm trong Cài đặt.")
      const old = list[index]
      list[index] = {
        ...old, name: v.name, ...connection(v, old), tool: v.tool === undefined ? old.tool || null : v.tool,
        updatedAt: new Date(clock()).toISOString(), updatedBy: actor,
      }
      write(list)
      return this.list()
    },
    // Link a Railway service (URL with project, service and environmentId) and a read-only project
    // token. The token is sealed and never listed; an empty URL removes the link.
    setRailway(id, input) {
      if (!this.list().targets.some((t) => t.id === id)) fail("Không tìm thấy ứng dụng.")
      const v = z.object({ url: z.string().trim().max(700), token: z.string().trim().min(10).max(512).optional() }).strict().parse(input || {})
      const map = readKey("monitoring-railway-v1", {})
      if (!v.url) delete map[id]
      else {
        const binding = railwayBinding(v.url)
        const token = v.token ? seal(v.token) : map[id] && map[id].projectId === binding.projectId && map[id].environmentId === binding.environmentId ? map[id].token : null
        if (!token) fail("Cần Railway project token của đúng project/environment.")
        map[id] = { ...binding, token }
      }
      writeKey("monitoring-railway-v1", map)
      return this.list()
    },
    // Railway links with their unsealed token, for the server-side deploy reader only.
    railwayLinks() {
      const map = readKey("monitoring-railway-v1", {})
      const ids = new Set(this.list().targets.map((t) => t.id))
      return Object.entries(map)
        .filter(([id]) => ids.has(id))
        .map(([id, l]) => ({ id, projectId: l.projectId, serviceId: l.serviceId, environmentId: l.environmentId, token: unseal(l) }))
        .filter((l) => l.token)
    },
    priorities() {
      return readKey("monitoring-priorities-v1", [])
    },
    // Tech/Lead decision on an optimisation point: "open" records it, "done" closes it.
    setPriority(input, actor) {
      const v = z.object({
        key: z.string().max(300), toolId: z.string().regex(idPattern), job: z.string().max(200).default(""),
        kind: z.enum(["time", "error"]), status: z.enum(["open", "done"]),
      }).strict().parse(input)
      if (!this.list().targets.some((t) => t.id === v.toolId)) fail("Không tìm thấy ứng dụng.")
      const at = new Date(clock()).toISOString()
      const list = readKey("monitoring-priorities-v1", []).filter((p) => !(p.key === v.key && p.status === "open"))
      list.unshift(v.status === "open" ? { ...v, decidedBy: actor, decidedAt: at } : { ...v, decidedBy: actor, decidedAt: at, doneAt: at })
      writeKey("monitoring-priorities-v1", list.slice(0, 200))
      return list.slice(0, 200)
    },
    // Current profile of any listed tool (Settings entry or environment tool), or undefined.
    profile(id) {
      const stored = read().find((t) => t.id === id)
      if (stored) return stored.tool || null
      return env().targets.some((t) => t.id === id) ? readProfiles()[id] || null : undefined
    },
    // Replace a tool's profile (admin adjustment or detection) for either kind of tool.
    saveProfile(id, input) {
      const tool = toolConfigSchema.parse(input)
      const list = read(),
        index = list.findIndex((t) => t.id === id)
      if (index >= 0) {
        list[index] = { ...list[index], tool }
        write(list)
      } else if (env().targets.some((t) => t.id === id)) {
        writeProfiles({ ...readProfiles(), [id]: tool })
      } else fail("Không tìm thấy ứng dụng.")
      return this.list()
    },
    // Store a profile detected from a real report, keeping manual overrides of the previous one.
    applyDetection(id, report, detect) {
      const old = this.profile(id)
      if (old === undefined) return null
      if (old && old.auto === false) return old
      const tool = toolConfigSchema.parse(detect(report, old || null))
      this.saveProfile(id, tool)
      return tool
    },
    // Detected profiles are refreshed daily, and at once when the report shows a job the stored
    // profile does not list yet (a new sub-job, or steps the app has just declared).
    needsDetection(id, now = clock(), report = null) {
      const listed = this.list().targets.find((t) => t.id === id)
      if (!listed || !listed.connected || listed.tool?.auto === false) return false
      if (!listed.tool?.detectedAt || now - Date.parse(listed.tool.detectedAt) > 86400000) return true
      const known = new Set((listed.tool.jobs || []).map((j) => j.name))
      return Boolean(report) && reportJobNames(report).some((name) => !known.has(name))
    },
    remove(id) {
      const list = read()
      if (!list.some((t) => t.id === id))
        fail(this.list().targets.some((t) => t.id === id)
          ? "Ứng dụng này cấu hình qua LAB_MONITORING_TARGETS; xóa trong biến môi trường Railway."
          : "Không tìm thấy ứng dụng.")
      write(list.filter((t) => t.id !== id))
      const links = readKey("monitoring-railway-v1", {})
      if (links[id] && !env().targets.some((t) => t.id === id)) {
        delete links[id]
        writeKey("monitoring-railway-v1", links)
      }
      const profiles = readProfiles()
      if (profiles[id] && !env().targets.some((t) => t.id === id)) {
        delete profiles[id]
        writeProfiles(profiles)
      }
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

// Job names an app reports, offered as suggestions when declaring jobs in Settings.
export function reportedJobs(report) {
  const names = [
    ...(Array.isArray(report.jobRuns?.runs) ? report.jobRuns.runs.slice(0, 5000).map((j) => j?.job) : []),
    ...(Array.isArray(report.jobHistoryAllTime?.completion) ? report.jobHistoryAllTime.completion.map((j) => j?.job) : []),
    ...(Array.isArray(report.performanceKpis?.jobCompletion) ? report.performanceKpis.jobCompletion.map((j) => j?.job) : []),
    report.jobHistory?.latestJob?.job,
    report.jobHistoryAllTime?.latestJob?.job,
    ...(report.profile?.jobTargets && typeof report.profile.jobTargets === "object" ? Object.keys(report.profile.jobTargets) : []),
  ]
  return [...new Set(names.filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim().slice(0, 100)))].slice(0, 20)
}

const sectionsOf = (report) =>
  ["jobRuns", "profile", "jobHistory", "jobHistoryAllTime", "performanceKpis", "http", "ai", "runtime", "database", "inventory", "contentWorkload"].filter(
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
    // Uncached 30-day read used to detect a tool profile when a tool is saved or re-detected.
    fullReport(target) {
      return fetchReport(target, 30, target.appId)
    },
    // Connection test for Settings: never cached, never returns the report body or the token.
    // It returns the profile Lab would detect, so the admin sees jobs and targets before saving.
    async probe(target) {
      const result = await fetchReport(target, 30, null)
      return {
        status: result.status,
        httpStatus: result.httpStatus ?? null,
        appId: result.report?.appId ?? result.reportedAppId ?? null,
        fetchMs: result.fetchMs ?? null,
        sections: result.report ? sectionsOf(result.report) : [],
        profileTitle: typeof result.report?.profile?.mainJob?.title === "string" ? result.report.profile.mainJob.title.slice(0, 100) : null,
        jobs: result.report ? reportedJobs(result.report) : [],
        detected: result.report ? detectToolProfile(result.report, null, { now: now() }) : null,
        hasRuns: Array.isArray(result.report?.jobRuns?.runs),
      }
    },
    clear() {
      cache = new Map()
    },
  }
}

const deployQuery = `query LabToolDeploys($input: DeploymentListInput!) { deployments(input: $input, first: 20) { edges { node { id status createdAt meta } } } }`

// Read-only Railway deployments per linked tool, cached five minutes; failures stay per tool.
export function createDeployEvents({ links = () => [], fetcher = fetch, now = Date.now } = {}) {
  let cache = new Map()
  async function read(link) {
    const query = async (q, variables = {}) => {
      const r = await fetcher("https://backboard.railway.com/graphql/v2", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", "Project-Access-Token": link.token },
        body: JSON.stringify({ query: q, variables }),
      })
      if (!r.ok) throw new Error("Railway trả HTTP " + r.status)
      const b = await r.json()
      if (b.errors?.length || !b.data) throw new Error("Railway từ chối truy vấn; kiểm tra token và quyền đọc.")
      return b.data
    }
    try {
      const scope = await query("query LabTokenScope{projectToken{projectId environmentId}}")
      if (scope.projectToken?.projectId !== link.projectId || scope.projectToken?.environmentId !== link.environmentId)
        return { error: "Token Railway không thuộc project/environment đã liên kết." }
      const data = await query(deployQuery, { input: { projectId: link.projectId, serviceId: link.serviceId, environmentId: link.environmentId } })
      const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : null)
      return {
        items: (data.deployments?.edges || []).map((e) => e.node).filter((n) => n && typeof n.id === "string").slice(0, 20).map((n) => ({
          id: n.id.slice(0, 64), status: text(n.status, 30), createdAt: text(n.createdAt, 40),
          commitHash: text(n.meta?.commitHash, 40), commitMessage: text(n.meta?.commitMessage?.split("\n")[0], 120),
        })),
      }
    } catch (e) {
      return { error: e.name === "TimeoutError" ? "Railway không phản hồi." : String(e.message || "Không đọc được Railway").slice(0, 160) }
    }
  }
  return {
    async snapshot() {
      const result = {}
      await Promise.all(links().map(async (l) => {
        const key = [l.id, l.projectId, l.serviceId, l.environmentId, crypto.createHash("sha256").update(l.token).digest("hex")].join(":")
        const prior = cache.get(key)
        if (!prior || prior.until <= now()) cache.set(key, { until: now() + 300000, promise: read(l) })
        result[l.id] = await cache.get(key).promise
      }))
      if (cache.size > 100) cache = new Map()
      return result
    },
    clear() {
      cache = new Map()
    },
  }
}
