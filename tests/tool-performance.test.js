import test from "node:test"
import assert from "node:assert/strict"
import { timeStatus, errorStatus, evaluateTool, priorities, summarize, jobOutcomes } from "../src/tool-performance.js"

const min = 60000
const report = (extra = {}) => ({ appId: "rfp", protocol: "app-monitoring-v1", ...extra })

test("P95 is scored only with enough samples and a declared target", () => {
  assert.equal(timeStatus({ p95Ms: null, samples: 0, targetMinutes: 1 }), "nodata")
  assert.equal(timeStatus({ p95Ms: 5 * min, samples: 30, targetMinutes: null }), "notarget")
  assert.equal(timeStatus({ p95Ms: 9 * min, samples: 19, targetMinutes: 1 }), "insufficient")
  assert.equal(timeStatus({ p95Ms: 2 * min, samples: 20, targetMinutes: 1 }), "bad")
  assert.equal(timeStatus({ p95Ms: 1 * min, samples: 20, targetMinutes: 1 }), "ok")
  assert.equal(timeStatus({ p95Ms: 2 * min, samples: 7, targetMinutes: 1 }, 5), "bad")
})

test("error rate counts every failure and fails early when the sample minimum cannot rescue it", () => {
  assert.equal(errorStatus({ failed: 0, executed: 0, target: 2 }), "nodata")
  assert.equal(errorStatus({ failed: 1, executed: 40, target: null }), "notarget")
  // target 5% over 20 runs allows 1 failure: 2 failures in 10 runs is already over.
  assert.equal(errorStatus({ failed: 2, executed: 10, target: 5 }), "bad")
  assert.equal(errorStatus({ failed: 1, executed: 10, target: 5 }), "insufficient")
  assert.equal(errorStatus({ failed: 1, executed: 100, target: 2 }), "ok")
  assert.equal(errorStatus({ failed: 3, executed: 100, target: 2 }), "bad")
})

test("job outcomes prefer saved history and treat non-valid instrumented runs as failures", () => {
  assert.deepEqual(jobOutcomes(report({ jobHistory: { executed: 10, failed: 2, unverifiedCompletions: 1, complete: true } })),
    { executed: 10, failed: 2, unverified: 1, complete: true })
  assert.equal(jobOutcomes(report({ performanceKpis: { jobs: { executed: 10, validCompletions: 7 } } })).failed, 3)
  assert.equal(jobOutcomes(report({ jobHistory: { executed: 1, failed: 5 } })), null)
})

test("a declared tool without a data source shows No data, never Đạt", () => {
  const t = evaluateTool({ id: "cv", name: "CV Screening", connected: false, tool: { mainJob: "Chấm 1 CV", jobs: [] } })
  assert.equal(t.status, "nodata")
  assert.equal(t.reason, "Chưa kết nối nguồn dữ liệu")
})

test("main job status uses the worst workload group and Lab targets override app targets", () => {
  const r = report({
    profile: { jobTargets: { "Đọc hồ sơ": 999 } },
    jobHistory: { executed: 25, failed: 0, unverifiedCompletions: 0, complete: true },
    performanceKpis: { jobCompletion: [
      { job: "Bid pack", workload: "≤15 trang", p95Ms: 85 * min, samples: 25 },
      { job: "Bid pack", workload: ">15 trang", p95Ms: 210 * min, samples: 25 },
      { job: "Đọc hồ sơ", workload: ">15 trang", p95Ms: 95 * min, samples: 25 },
    ] },
  })
  const tool = { mainJob: "Bộ thông tin bid", errorRateTarget: 2, jobs: [
    { name: "Bid pack", role: "main", targetMinutes: 150 },
    { name: "Đọc hồ sơ", role: "sub", targetMinutes: 50 },
    { name: "Câu hỏi client", role: "sub", targetMinutes: 20 },
  ] }
  const t = evaluateTool({ id: "rfp", name: "RFP", tool, result: { status: "ready", report: r } })
  assert.equal(t.status, "bad")
  assert.equal(t.headline.workload, ">15 trang")
  assert.equal(t.jobs.find((j) => j.name === "Đọc hồ sơ").units[0].targetMinutes, 50)
  assert.equal(t.jobs.find((j) => j.name === "Câu hỏi client").unmeasured, true)
  const p = priorities([t])
  assert.deepEqual(p.time.map((x) => x.job), ["Đọc hồ sơ", "Bid pack"])
  assert.equal(Math.round(p.time[0].overPercent), 90)
  assert.equal(p.errors.length, 0)
})

test("missing targets, small samples and unconfigured apps get distinct statuses", () => {
  const r = report({ jobHistory: { executed: 6, failed: 0, unverifiedCompletions: 0 },
    performanceKpis: { jobCompletion: [{ job: "Batch", workload: "5 bài", p95Ms: 10 * min, samples: 6 }] } })
  const result = { status: "ready", report: r }
  assert.equal(evaluateTool({ id: "a", name: "A", tool: null, result }).status, "notarget")
  const configured = { errorRateTarget: 2, jobs: [{ name: "Batch", role: "main", targetMinutes: 20 }] }
  assert.equal(evaluateTool({ id: "a", name: "A", tool: configured, result }).status, "insufficient")
  const lowered = { ...configured, minSamples: 5 }
  assert.equal(evaluateTool({ id: "a", name: "A", tool: lowered, result }).status, "ok")
  const empty = evaluateTool({ id: "b", name: "B", tool: configured, result: { status: "ready", report: report({ jobHistory: { executed: 0, failed: 0 } }) } })
  assert.equal(empty.status, "nodata")
  assert.equal(empty.reason, "Chưa có lần chạy nào trong kỳ")
  assert.deepEqual(summarize([empty]), { bad: 0, insufficient: 0, notarget: 0, nodata: 1, ok: 0 })
})

test("errors over target enter the separate error priority list", () => {
  const r = report({ jobHistory: { executed: 420, failed: 9, unverifiedCompletions: 0 },
    performanceKpis: { jobCompletion: [{ job: "Thao tác", workload: "", p95Ms: 7000, samples: 420 }] } })
  const t = evaluateTool({ id: "li", name: "LinkedIn", result: { status: "ready", report: r },
    tool: { errorRateTarget: 2, jobs: [{ name: "Thao tác", role: "main", targetMinutes: 8 / 60 }] } })
  assert.equal(t.status, "bad")
  assert.equal(priorities([t]).errors[0].failed, 9)
})
