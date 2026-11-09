import test from "node:test"
import assert from "node:assert/strict"
import {
  monitoringTargets,
  createAppMonitoring,
  createMonitoringRegistry,
} from "../server/app-monitoring.js"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "../server/db.js"
const target = {
  id: "writer-studio",
  name: "Writer",
  origin: "https://writer.up.railway.app",
  token: "private-token-".repeat(4),
  appId: "writer-studio",
}
test("monitoring targets reject unsafe destinations, invalid credentials and duplicate ids", () => {
  assert.equal(monitoringTargets(JSON.stringify([target])).length, 1)
  for (const origin of [
    "http://writer.up.railway.app",
    "https://10.0.0.5",
    "https://localhost",
    "https://api.railway.internal",
    "https://writer.up.railway.app:8443",
    "https://writer.up.railway.app/private",
    "https://user:pass@writer.up.railway.app",
    "https://writer.up.railway.app?token=leak",
  ])
    assert.throws(() =>
      monitoringTargets(JSON.stringify([{ ...target, origin }])),
    )
  assert.throws(() => monitoringTargets(JSON.stringify([target, target])))
})
test("monitoring sends bearer only to fixed endpoint, deduplicates reads and does not return secret", async () => {
  let calls = 0
  const monitor = createAppMonitoring({
    targets: () => [target],
    fetcher: async (url, options) => {
      calls++
      assert.equal(url, target.origin + "/internal/monitoring?days=7")
      assert.equal(options.redirect, "error")
      assert.equal(options.headers.Authorization, "Bearer " + target.token)
      return Response.json({
        protocol: "app-monitoring-v1",
        appId: "writer-studio",
        generatedAt: new Date().toISOString(),
        window: { days: 7 },
        http: { calls: 3 },
        ai: { calls: 2 },
        runtime: {},
        database: { status: "ready" },
      })
    },
  })
  const [a, b] = await Promise.all([monitor.snapshot(7), monitor.snapshot(7)])
  assert.equal(calls, 1)
  assert.deepEqual(a.targets, b.targets)
  assert.equal(a.targets[0].status, "ready")
  assert.ok(!JSON.stringify(a).includes(target.token))
})
test("authorization failures, invalid identities and redirects are isolated per app", async () => {
  for (const response of [
    new Response("", { status: 401 }),
    Response.json({ protocol: "app-monitoring-v1", appId: "wrong" }),
  ]) {
    const monitor = createAppMonitoring({
      targets: () => [target],
      fetcher: async () => response,
    })
    const result = await monitor.snapshot(7)
    assert.equal(result.targets[0].report, null)
    assert.ok(!JSON.stringify(result).includes(target.token))
  }
})
test("an app may report only its profile and runtime; http and ai stay optional", async () => {
  const report = (extra) => ({
    protocol: "app-monitoring-v1", appId: "writer-studio", generatedAt: new Date().toISOString(),
    window: { days: 7 }, database: { status: "ready" }, ...extra,
  })
  for (const [extra, ok] of [
    [{ runtime: {}, profile: { version: "profile-v1" } }, true],
    [{ profile: { version: "profile-v1" } }, true],
    [{}, false],
    [{ runtime: {}, http: "bad" }, false],
    [{ profile: [] }, false],
  ]) {
    const monitor = createAppMonitoring({ targets: () => [target], fetcher: async () => Response.json(report(extra)) })
    const result = await monitor.snapshot(7)
    assert.equal(result.targets[0].report !== null, ok, JSON.stringify(extra))
  }
})

test("admins add, edit and remove apps in Settings; tokens are sealed and never listed", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "lab-monitoring-"))
  const db = openDatabase(dir)
  try {
    const config = { SESSION_SECRET: "s".repeat(40), LAB_MONITORING_TARGETS: JSON.stringify([target]) }
    const registry = createMonitoringRegistry(db, config)
    const token = "outreach-secret-".repeat(3)
    let list = registry.add({ name: "Outreach App", origin: "https://outreach.up.railway.app/", appId: "outreach", token }, "admin")
    assert.deepEqual(list.targets.map((t) => [t.id, t.source]), [["outreach-app", "settings"], ["writer-studio", "environment"]])
    assert.ok(!JSON.stringify(list).includes(token))
    const stored = db.prepare("SELECT value FROM settings WHERE key='monitoring-targets-v1'").get().value
    assert.ok(!stored.includes(token), "token is encrypted at rest")
    assert.equal(registry.targets().find((t) => t.id === "outreach-app").token, token)
    registry.add({ name: "Outreach App", origin: "https://other.vercel.app", appId: "x", token }, "admin")
    assert.ok(registry.list().targets.some((t) => t.id === "outreach-app-2"), "ids stay unique")
    assert.throws(() => registry.add({ name: "Bad", origin: "https://127.0.0.1", appId: "x", token }, "admin"))
    assert.throws(() => registry.add({ name: "No token", origin: "https://a.example.com", appId: "x" }, "admin"))
    assert.throws(() => registry.update("outreach-app", { name: "Moved", origin: "https://moved.example.com", appId: "outreach" }, "admin"), /token/)
    registry.update("outreach-app", { name: "Outreach", origin: "https://outreach.up.railway.app", appId: "outreach" }, "admin")
    assert.equal(registry.list().targets[0].name, "Outreach")
    assert.throws(() => registry.remove("writer-studio"), /LAB_MONITORING_TARGETS/)
    list = registry.remove("outreach-app")
    assert.ok(!list.targets.some((t) => t.id === "outreach-app"))
    const rotated = createMonitoringRegistry(db, { ...config, SESSION_SECRET: "t".repeat(40) })
    assert.equal(rotated.list().targets[0].tokenReadable, false, "a changed key is reported, not silently used")
    assert.ok(!rotated.targets().some((t) => t.id === "outreach-app-2"))
    assert.throws(() => rotated.probeTarget({ id: "outreach-app-2" }), /token/)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
test("connection test reports the app id and sections without returning the report or token", async () => {
  const monitor = createAppMonitoring({
    targets: () => [],
    fetcher: async () => Response.json({
      protocol: "app-monitoring-v1", appId: "outreach", generatedAt: new Date().toISOString(), window: { days: 30 },
      runtime: {}, profile: { version: "profile-v1", mainJob: { title: "Outreach LinkedIn" } }, jobHistory: { executed: 1 },
    }),
  })
  const result = await monitor.probe({ id: "probe", name: "probe", origin: "https://outreach.up.railway.app", token: "x".repeat(40) })
  assert.equal(result.status, "degraded")
  assert.equal(result.appId, "outreach")
  assert.deepEqual(result.sections, ["profile", "jobHistory", "runtime"])
  assert.equal(result.profileTitle, "Outreach LinkedIn")
  assert.ok(!JSON.stringify(result).includes("x".repeat(40)))
  const missing = createAppMonitoring({ targets: () => [], fetcher: async () => new Response("", { status: 404 }) })
  assert.equal((await missing.probe({ id: "p", name: "p", origin: "https://a.example.com", token: "x".repeat(40) })).status, "not-found")
})
test("tools can be declared before a data source exists and keep Lab-owned targets", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "lab-monitoring-"))
  const db = openDatabase(dir)
  try {
    const registry = createMonitoringRegistry(db, { SESSION_SECRET: "s".repeat(40) })
    const tool = { owner: "HR", mainJob: "Chấm 1 CV", errorRateTarget: 0.5,
      jobs: [{ name: "Chấm CV", role: "main", targetMinutes: 0.5, startEvent: "CV upload", endEvent: "Kết quả lưu" }] }
    let list = registry.add({ name: "CV Screening", tool }, "admin")
    const cv = list.targets.find((t) => t.id === "cv-screening")
    assert.equal(cv.connected, false)
    assert.equal(cv.tokenReadable, true, "a tool without a source never asks for a token")
    assert.equal(cv.tool.minSamples, 20, "minimum samples defaults to 20")
    assert.equal(cv.tool.jobs[0].perItem, false)
    assert.equal(registry.targets().length, 0, "unconnected tools are never fetched")
    assert.throws(() => registry.add({ name: "Two mains", tool: { jobs: [{ name: "a", role: "main" }, { name: "b", role: "main" }] } }, "admin"), /Main Job/)
    assert.throws(() => registry.add({ name: "Dupes", tool: { jobs: [{ name: "a" }, { name: "a" }] } }, "admin"), /trùng/)
    assert.throws(() => registry.add({ name: "Token only", token: "x".repeat(40) }, "admin"), /địa chỉ/)
    // Connecting later keeps the declared jobs; editing without `tool` leaves them unchanged.
    const token = "cv-secret-".repeat(4)
    list = registry.update("cv-screening", { name: "CV Screening", origin: "https://cv.example.com", appId: "cv", token }, "admin")
    assert.equal(list.targets[0].connected, true)
    assert.equal(list.targets[0].tool.jobs[0].name, "Chấm CV")
    assert.equal(registry.targets()[0].token, token)
    // Disconnecting removes the stored token.
    registry.update("cv-screening", { name: "CV Screening", origin: "", appId: "" }, "admin")
    assert.ok(!db.prepare("SELECT value FROM settings WHERE key='monitoring-targets-v1'").get().value.includes('"token":"'))
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
test("connection test lists reported job names for declaring jobs", async () => {
  const monitor = createAppMonitoring({
    targets: () => [],
    fetcher: async () => Response.json({
      protocol: "app-monitoring-v1", appId: "w", generatedAt: new Date().toISOString(), window: { days: 30 }, runtime: {},
      performanceKpis: { jobCompletion: [{ job: "Writer batch article", workload: "1 bài", p95Ms: 1, samples: 1 }] },
      jobHistory: { latestJob: { job: "Writer batch article" } }, profile: { jobTargets: { Plan: 1 } },
    }),
  })
  const result = await monitor.probe({ id: "p", name: "p", origin: "https://w.example.com", token: "x".repeat(40) })
  assert.deepEqual(result.jobs, ["Writer batch article", "Plan"])
})
test("detected profiles are stored, refreshed daily and keep admin overrides", async () => {
  const { detectToolProfile } = await import("../server/tool-performance.js")
  const dir = mkdtempSync(path.join(os.tmpdir(), "lab-monitoring-"))
  const db = openDatabase(dir)
  try {
    let clock = Date.parse("2026-11-09T03:00:00Z")
    const registry = createMonitoringRegistry(db, { SESSION_SECRET: "s".repeat(40) }, { clock: () => clock })
    registry.add({ name: "Writer", origin: "https://writer.example.com", appId: "writer", token: "w".repeat(40) }, "admin")
    assert.equal(registry.needsDetection("writer"), true)
    const report = { appId: "writer", jobHistoryAllTime: { executed: 30, failed: 0, completion: [{ job: "Batch", p95Ms: 300000, samples: 30 }] } }
    const tool = registry.applyDetection("writer", report, (r, prev) => detectToolProfile(r, prev, { now: clock }))
    assert.equal(tool.jobs[0].role, "main")
    assert.equal(tool.jobs[0].targetMinutes, 5)
    assert.equal(registry.needsDetection("writer"), false)
    // Admin override survives the next daily detection.
    const listed = registry.list().targets[0]
    registry.update("writer", { name: "Writer", origin: listed.origin, appId: listed.appId,
      tool: { ...listed.tool, jobs: [{ ...listed.tool.jobs[0], targetMinutes: 3, targetSource: "manual" }] } }, "admin")
    clock += 86400001
    assert.equal(registry.needsDetection("writer"), true)
    registry.applyDetection("writer", report, (r, prev) => detectToolProfile(r, prev, { now: clock }))
    assert.equal(registry.list().targets[0].tool.jobs[0].targetMinutes, 3)
    assert.equal(registry.needsDetection("cv"), false, "unknown or unconnected tools are never detected")
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
test("tools from LAB_MONITORING_TARGETS get detected, adjustable profiles too", async () => {
  const { detectToolProfile } = await import("../server/tool-performance.js")
  const dir = mkdtempSync(path.join(os.tmpdir(), "lab-monitoring-"))
  const db = openDatabase(dir)
  try {
    let clock = Date.parse("2026-11-09T03:00:00Z")
    const config = { SESSION_SECRET: "s".repeat(40), LAB_MONITORING_TARGETS: JSON.stringify([target]) }
    const registry = createMonitoringRegistry(db, config, { clock: () => clock })
    assert.equal(registry.list().targets[0].tool, null)
    assert.equal(registry.needsDetection("writer-studio"), true, "environment tools are detected as well")
    const report = { appId: "writer-studio", jobRuns: { runs: Array.from({ length: 20 }, (_, i) => ({
      job: "Writer batch article", status: "success", startedAt: new Date(clock - (i + 2) * 3600000).toISOString(),
      endedAt: new Date(clock - (i + 2) * 3600000 + 300000).toISOString() })) } }
    registry.applyDetection("writer-studio", report, (r, prev) => detectToolProfile(r, prev, { now: clock }))
    let listed = registry.list().targets[0]
    assert.equal(listed.source, "environment")
    assert.equal(listed.tool.jobs[0].role, "main")
    assert.equal(listed.tool.jobs[0].targetSource, "builtin", "Writer's built-in 10-minute target applies")
    assert.equal(listed.tool.errorRateTarget, 1)
    assert.equal(registry.needsDetection("writer-studio"), false)
    // Admin adjustment through the profile route survives re-detection.
    registry.saveProfile("writer-studio", { ...listed.tool, errorRateTarget: 3, errorRateTargetSource: "manual" })
    clock += 86400001
    registry.applyDetection("writer-studio", report, (r, prev) => detectToolProfile(r, prev, { now: clock }))
    listed = registry.list().targets[0]
    assert.equal(listed.tool.errorRateTarget, 3)
    assert.throws(() => registry.saveProfile("missing", listed.tool), /Không tìm thấy/)
    assert.throws(() => registry.remove("writer-studio"), /LAB_MONITORING_TARGETS/)
    assert.equal(registry.list().targets[0].tool.errorRateTarget, 3, "a refused removal keeps the profile")
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
