import test from "node:test"
import assert from "node:assert/strict"
import {
  modelSeries,
  latencyDotPlot,
  hourlySeries,
  responseShare,
  statusTone,
  projectPerformanceMetrics,
  projectJobHistoryMetrics,
  jobCompletionTarget,
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

test("latency plot preserves equal readings, missing percentiles, and zero", () => {
  const plot = latencyDotPlot({ p50Ms: 0, p95Ms: 1000, p99Ms: 1000 })
  assert.equal(plot.valid, true)
  assert.deepEqual(plot.points.map(({ value }) => value), [0, 1000, 1000])
  assert.ok(plot.limit >= 1000)
  assert.equal(latencyDotPlot({ p50Ms: 20, p99Ms: 100 }).points[1].value, null)
  assert.equal(latencyDotPlot({ p50Ms: 100, p95Ms: 20 }).valid, false)
  assert.equal(latencyDotPlot({}).hasSamples, false)
})

test("project targets keep missing user and job measurements separate from HTTP and task telemetry", () => {
  const report = {
    http: { calls: 3, p95Ms: 120 },
    taskUsage: { rows: [{ kind: "gate", status: "completed", startedAt: "2026-11-05", finishedAt: "2026-11-06" }] },
  }
  assert.deepEqual(projectPerformanceMetrics(report), {
    httpP95Ms: 120, responseMs: null, clickMs: null,
    executed: null, errorRate: null, successRate: null,
  })

  const performanceKpis = {
    responseTime: { p95Ms: 2300, samples: 20 },
    clickLatency: { p95Ms: 0, samples: 0 },
    jobs: { executed: 20, technicalErrors: 0, validCompletions: 19 },
  }
  const measured = projectPerformanceMetrics({ ...report, performanceKpis })
  assert.equal(measured.responseMs, 2300)
  assert.equal(measured.clickMs, null)
  assert.equal(measured.errorRate, 0)
  assert.equal(measured.successRate, 95)
  assert.equal(projectPerformanceMetrics({ performanceKpis: {
    jobs: { executed: 0, technicalErrors: 0, validCompletions: 0 },
  } }).errorRate, null)
})

test("job history rates use the project's terminal outcomes and preserve ambiguity", () => {
  const job = { job: "Gate", workload: "1 item", durationMs: 100 }
  const history = {
    executed: 10, failed: 2, technicalErrors: 1, unclassifiedFailures: 1,
    validCompletions: 7, unverifiedCompletions: 1, complete: true, latestJob: job,
  }
  const measured = projectJobHistoryMetrics(history)
  assert.deepEqual(measured.errorRange, [10, 20])
  assert.deepEqual(measured.successRange, [70, 80])
  assert.equal(projectJobHistoryMetrics(null), null)
  assert.equal(projectJobHistoryMetrics({ ...history, executed: 9 }), null)
})

test("latest job targets are fixed for known project and job pairs", () => {
  assert.equal(jobCompletionTarget("writer-studio", "Writer batch article"), 10)
  assert.equal(jobCompletionTarget("intercom", "EB V2 brief"), 0.25)
  assert.equal(jobCompletionTarget("intercom", "EB V2 article"), 0.25)
  assert.equal(jobCompletionTarget("intercom", "EB V2 adapt"), 0.5)
  assert.equal(jobCompletionTarget("intercom", "EB V2 review"), 0.5)
  assert.equal(jobCompletionTarget("intercom", "Writer batch article"), null)
})
