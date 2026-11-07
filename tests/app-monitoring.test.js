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
      protocol: "app-monitoring-v1", appId: "outreach", generatedAt: new Date().toISOString(), window: { days: 1 },
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
