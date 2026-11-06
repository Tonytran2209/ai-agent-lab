import test from "node:test"
import assert from "node:assert/strict"
import {
  monitoringTargets,
  createAppMonitoring,
} from "../server/app-monitoring.js"
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
    "https://evil.example",
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
