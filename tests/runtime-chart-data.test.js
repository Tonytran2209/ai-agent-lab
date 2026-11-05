import test from "node:test"
import assert from "node:assert/strict"
import {
  modelSeries,
  hourlySeries,
  responseShare,
  statusTone,
} from "../src/runtime-chart-data.js"
test("chart series combines workflow steps but never mixes historical and new usage or double-counts cache", () => {
  const report = {
    ai: {
      models: [
        {
          model: "p:m",
          calls: 1,
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 3,
          pricedCalls: 0,
          knownCostUsd: null,
        },
      ],
    },
    ledger: {
      models: [
        {
          provider: "p",
          model: "m",
          calls: 2,
          input_tokens: 100,
          cached_input_tokens: 25,
          output_tokens: 20,
          priced_calls: 2,
          known_cost_usd: 0.2,
        },
        {
          provider: "p",
          model: "m",
          calls: 1,
          input_tokens: 50,
          cached_input_tokens: 5,
          output_tokens: 10,
          priced_calls: 0,
          known_cost_usd: null,
        },
        {
          provider: "p",
          model: "missing",
          calls: 1,
          input_tokens: 5,
          output_tokens: 2,
          known_cost_usd: null,
        },
      ],
    },
  }
  const historical = modelSeries(report, "ledger")
  assert.equal(historical[0].total, 180)
  assert.equal(historical[0].cached, 30)
  assert.equal(historical[0].cost, 0.2)
  assert.equal(historical[0].priced, 2)
  assert.equal(historical[1].cost, null)
  const current = modelSeries(report, "dispatcher")
  assert.equal(current.length, 1)
  assert.equal(current[0].total, 13)
  assert.equal(current[0].cost, null)
})
test("sparse observations retain real hours and response percentage excludes aborted requests", () => {
  const rows = [
    { hour: "2026-11-05T05:00:00Z", calls: 3 },
    { hour: "2026-11-05T01:00:00Z", calls: 1 },
  ]
  const sorted = hourlySeries(rows)
  assert.equal(sorted.length, 2)
  assert.equal(sorted[0].calls, 1)
  assert.equal(rows[0].calls, 3)
  assert.equal(responseShare({ calls: 10, aborted: 2, failed: 2 }), 75)
  assert.equal(responseShare({ calls: 0, failed: 0 }), null)
  assert.equal(responseShare({ calls: 2, aborted: 2, failed: 0 }), null)
  assert.equal(statusTone("EB V2 · rejected"), "bad")
  assert.equal(statusTone("not_started"), "waiting")
  assert.equal(statusTone("completed"), "good")
})

test("latency curve stays monotone without overshoot and keeps missing percentiles missing", async () => {
  const { latencyCurve } = await import("../src/runtime-chart-data.js")
  const c = latencyCurve({ p50Ms: 20, p95Ms: 1000, p99Ms: 1000 })
  assert.equal(c.valid, true)
  assert.equal(c.points[1].y, c.points[2].y)
  assert.ok(c.points[0].y > c.points[1].y)
  assert.equal((c.path.match(/ C /g) || []).length, 2)
  // Horizontal tangent Bezier control values are endpoint values: all interpolated y
  // are a convex combination, so no synthetic peak/dip can exceed either endpoint.
  const ys = c.points.map((p) => p.y)
  for (let i = 1; i < ys.length; i++)
    for (let j = 0; j <= 20; j++) {
      const t = j / 20
      const y =
        (1 - t) ** 3 * ys[i - 1] +
        3 * (1 - t) ** 2 * t * ys[i - 1] +
        3 * (1 - t) * t * t * ys[i] +
        t ** 3 * ys[i]
      assert.ok(y <= ys[i - 1] + 1e-9 && y >= ys[i] - 1e-9)
    }
  const sparse = latencyCurve({ p50Ms: 20, p95Ms: null, p99Ms: 100 })
  assert.equal(sparse.points[1].y, null)
  assert.equal(sparse.path.includes(" C "), false)
  assert.equal(latencyCurve({ p50Ms: 100, p95Ms: 20, p99Ms: 30 }).valid, false)
  assert.equal(
    latencyCurve({ p50Ms: null, p95Ms: null, p99Ms: null }).points.length,
    0,
  )
})
