import test from "node:test"
import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import {
  requestTaskUsage,
  usageFields,
  estimatedCost,
} from "../server/task-performance.js"
import { taskRows, taskSummary, rankedTasks, taskTimeline } from "../src/task-usage-data.js"
test("task means exclude missing usage/prices and do not combine historical with current counters", () => {
  const report = {
    taskUsage: {
      rows: [
        {
          id: "a",
          calls: 2,
          usageSamples: 2,
          pricedCalls: 2,
          inputTokens: 100,
          outputTokens: 50,
          knownCostUsd: 1,
          status: "completed",
        },
        {
          id: "b",
          calls: 2,
          usageSamples: 1,
          pricedCalls: 1,
          inputTokens: 20,
          knownCostUsd: 0.2,
          status: "completed",
        },
        {
          id: "c",
          calls: 1,
          usageSamples: 1,
          pricedCalls: 1,
          inputTokens: 10,
          knownCostUsd: 9,
          status: "running",
        },
      ],
    },
    historicalTasks: [
      {
        id: "old",
        inputTokens: 500,
        outputTokens: 50,
        status: "completed",
        knownCostUsd: null,
      },
    ],
  }
  const rows = taskRows(report)
  assert.equal(rows.length, 3)
  const summary = taskSummary(rows)
  assert.equal(summary.averageTokens, 150)
  assert.equal(summary.averageUsd, 1)
  assert.equal(summary.costSamples, 1)
  assert.equal(taskRows(report, true).length, 1)
  assert.equal(rankedTasks(rows)[0].id, "c")
  assert.equal(taskRows(report, true)[0].costComplete, false)
})
test("Lab report respects request/project cohort and preserves unknown legacy token breakdown and failed calls", () => {
  const db = new DatabaseSync(":memory:")
  db.exec(
    "CREATE TABLE agent_usage(id TEXT,day TEXT,data TEXT); CREATE TABLE ai_attempts(id TEXT,request_id TEXT,day TEXT,data TEXT)",
  )
  const insert = db.prepare("INSERT INTO agent_usage VALUES(?,?,?)")
  insert.run(
    "1",
    "2026-11-05",
    JSON.stringify({
      requestId: "one",
      model: "m",
      tokens: 120,
      state: "completed",
    }),
  )
  insert.run(
    "2",
    "2026-11-05",
    JSON.stringify({
      requestId: "other",
      model: "m",
      tokens: 900,
      state: "completed",
    }),
  )
  db.prepare("INSERT INTO ai_attempts VALUES(?,?,?,?)").run(
    "3",
    "one",
    "2026-11-05",
    JSON.stringify({ requestId: "one", model: "m", status: "failed" }),
  )
  const report = requestTaskUsage(db, [
    {
      id: "one",
      projectId: "a",
      title: "Task",
      status: "completed",
      createdAt: "2026-11-05",
    },
  ])
  assert.equal(report.rows.length, 1)
  const row = report.rows[0]
  assert.equal(row.calls, 2)
  assert.equal(row.totalTokens, 120)
  assert.equal(row.failedCalls, 1)
  assert.equal(row.usageSamples, 1)
  assert.equal(row.inputTokens, null)
  assert.equal(row.knownCostUsd, null)
  db.close()
})
test("pricing requires configured valid rates and cached tokens are a subset of input", () => {
  const usage = usageFields({
    total_tokens: 120,
    input_tokens: 100,
    output_tokens: 20,
    input_tokens_details: { cached_tokens: 30 },
  })
  assert.equal(usage.cached_tokens, 30)
  assert.equal(estimatedCost("m", usage, {}), null)
  assert.equal(
    estimatedCost("m", usage, {
      LAB_AI_MODEL_PRICING: JSON.stringify({
        m: {
          inputUsdPerMillion: 2,
          cachedInputUsdPerMillion: 1,
          outputUsdPerMillion: 10,
        },
      }),
    }),
    0.00037,
  )
})

test("task timeline uses UTC periods and distinguishes zero, missing and partial totals", () => {
  const report = { generatedAt: "2026-11-05T14:00:00Z", days: 1 }
  const periods = taskTimeline([
    { startedAt: "2026-11-04T23:59:59Z", usageSamples: 1, totalTokens: 90 },
    { startedAt: "2026-11-05T03:59:59Z", usageSamples: 1, totalTokens: 0, tokenComplete: true },
    { startedAt: "2026-11-05T04:00:00Z", usageSamples: 1, totalTokens: 200, knownCostUsd: 0.03, tokenComplete: true, costComplete: true },
    { startedAt: "2026-11-05T04:30:00Z", usageSamples: 0 },
    { startedAt: "2026-11-05T14:00:01Z", usageSamples: 1, totalTokens: 90 },
  ], report)

  assert.deepEqual(periods.map(({ count, tokens, usd }) => [count, tokens, usd]), [
    [1, 0, null],
    [2, 200, 0.03],
    [0, null, null],
    [0, null, null],
  ])
  assert.equal(periods[0].partialTokens, false)
  assert.equal(periods[1].partialTokens, true)
  assert.equal(periods[1].partialUsd, true)
})
