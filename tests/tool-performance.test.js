import test from "node:test"
import assert from "node:assert/strict"
import {
  timeStatus, errorStatus, evaluateTool, priorities, summarize, jobOutcomes,
  periodBounds, parseRuns, jobUnitsFor, detectToolProfile, niceTargetMinutes, percentile,
} from "../server/tool-performance.js"

const min = 60000
const report = (extra = {}) => ({ appId: "rfp", protocol: "app-monitoring-v1", ...extra })
// 2026-11-09 10:00 in Vietnam (03:00 UTC).
const now = Date.parse("2026-11-09T03:00:00Z")
const run = (job, startIso, minutes, status = "success", extra = {}) => ({
  job, status, startedAt: startIso,
  endedAt: status === "running" ? null : new Date(Date.parse(startIso) + minutes * min).toISOString(), ...extra,
})

test("periods are calendar days in Vietnam time", () => {
  const today = periodBounds(1, now)
  assert.equal(new Date(today.start).toISOString(), "2026-11-08T17:00:00.000Z", "today starts 00:00 GMT+7")
  assert.equal(new Date(today.previousStart).toISOString(), "2026-11-07T17:00:00.000Z")
  const week = periodBounds(7, now)
  assert.equal(new Date(week.start).toISOString(), "2026-11-02T17:00:00.000Z")
  assert.equal(week.previousEnd, week.start)
})

test("P95 is scored only with enough samples; a slow median fails early", () => {
  assert.equal(timeStatus({ p95Ms: null, samples: 0, targetMinutes: 1 }), "nodata")
  assert.equal(timeStatus({ p95Ms: 5 * min, samples: 30, targetMinutes: null }), "notarget")
  assert.equal(timeStatus({ p95Ms: 9 * min, samples: 19, targetMinutes: 1 }), "insufficient")
  assert.equal(timeStatus({ p95Ms: 9 * min, samples: 8, targetMinutes: 1, medianMs: 2 * min }), "bad")
  assert.equal(timeStatus({ p95Ms: 9 * min, samples: 4, targetMinutes: 1, medianMs: 2 * min }), "insufficient")
  assert.equal(timeStatus({ p95Ms: 2 * min, samples: 20, targetMinutes: 1 }), "bad")
  assert.equal(timeStatus({ p95Ms: 1 * min, samples: 20, targetMinutes: 1 }), "ok")
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 0.95), 19)
})

test("error rate counts every failure and fails early when the sample minimum cannot rescue it", () => {
  assert.equal(errorStatus({ failed: 0, executed: 0, target: 2 }), "nodata")
  assert.equal(errorStatus({ failed: 1, executed: 40, target: null }), "notarget")
  assert.equal(errorStatus({ failed: 2, executed: 10, target: 5 }), "bad")
  assert.equal(errorStatus({ failed: 1, executed: 10, target: 5 }), "insufficient")
  assert.equal(errorStatus({ failed: 1, executed: 100, target: 2 }), "ok")
  assert.equal(errorStatus({ failed: 3, executed: 100, target: 2 }), "bad")
})

test("aggregate outcomes prefer saved history and treat non-valid instrumented runs as failures", () => {
  assert.equal(jobOutcomes(report({ jobHistory: { executed: 10, failed: 2, unverifiedCompletions: 1, complete: true } })).failed, 2)
  assert.equal(jobOutcomes(report({ performanceKpis: { jobs: { executed: 10, validCompletions: 7 } } })).failed, 3)
  assert.equal(jobOutcomes(report({ jobHistory: { executed: 1, failed: 5 } })), null)
})

test("runs give Vietnam-time windows, previous-period comparison and timeouts", () => {
  const r = report({ jobRuns: { since: "2026-10-01T00:00:00Z", complete: true, runs: [
    run("Batch", "2026-11-08T17:30:00Z", 10), // today 00:30 VN
    run("Batch", "2026-11-08T16:30:00Z", 4), // yesterday 23:30 VN → previous day
    run("Batch", "2026-11-09T00:00:00Z", 6, "failed"),
    run("Batch", "2026-11-08T18:00:00Z", 0, "running"), // started 01:00 VN, 9h ago
    { job: "Batch", status: "success", startedAt: "bad-date" },
    { job: "Batch", status: "failed", startedAt: null, endedAt: "2026-11-09T01:00:00Z" }, // outcome only
    { job: "Batch", status: "running", startedAt: null, endedAt: null },
  ] } })
  assert.equal(parseRuns(r).runs.length, 5)
  const m = jobUnitsFor(r, 1, { now, targetFor: () => 60 })
  assert.equal(m.source, "runs")
  assert.equal(m.units[0].samples, 1)
  assert.equal(m.units[0].p95Ms, 10 * min)
  assert.equal(m.units[0].previousP95Ms, 4 * min)
  assert.equal(m.units[0].samples, 1, "a run without a start time adds no duration")
  assert.deepEqual(m.outcomes.get("Batch"), { executed: 4, failed: 3, timedOut: 1 }, "running past 3× target is a failure")
  const noTarget = jobUnitsFor(r, 1, { now, targetFor: () => null })
  assert.equal(noTarget.outcomes.get("Batch").timedOut, 0, "without a target a running job is not timed out")
})

test("detection picks the Main Job from the app, a parent job or a single job, never by guessing", () => {
  const history = (rows) => report({ jobHistoryAllTime: { executed: 40, failed: 1, completion: rows } })
  const one = detectToolProfile(history([{ job: "Writer batch article", workload: "1 bài", p95Ms: 8 * min, samples: 60 }]), null, { now })
  assert.equal(one.jobs[0].role, "main")
  assert.equal(one.jobs[0].targetSource, "baseline")
  assert.equal(one.jobs[0].targetMinutes, 8)
  assert.equal(one.errorRateTarget, 2.5, "1/40 failures: 2.5% baseline, rounded up to 0.5% steps, at least 1%")
  const many = detectToolProfile(history([{ job: "Brief", p95Ms: 9000, samples: 30 }, { job: "Article", p95Ms: 14000, samples: 30 }]), null, { now })
  assert.ok(many.jobs.every((j) => j.role === "sub"), "two independent jobs: no Main Job is guessed")
  assert.equal(many.jobs.find((j) => j.name === "Brief").targetMinutes, 9 / 60, "9 s baseline stays 9 s")
  const declared = detectToolProfile({ ...history([{ job: "Brief", p95Ms: 9000, samples: 30 }, { job: "Article", p95Ms: 14000, samples: 30 }]),
    profile: { mainJob: { job: "Article", title: "Bài truyền thông" }, jobTargets: { Brief: 0.25 } } }, null, { now })
  assert.equal(declared.jobs.find((j) => j.role === "main").name, "Article")
  assert.equal(declared.mainJob, "Bài truyền thông")
  assert.equal(declared.jobs.find((j) => j.name === "Brief").targetSource, "app")
  const parent = detectToolProfile(report({ jobRuns: { runs: [
    run("Bid pack", "2026-11-01T00:00:00Z", 100), run("Đọc hồ sơ", "2026-11-01T00:00:00Z", 30, "success", { parent: "Bid pack", workload: ">15 trang" }),
  ] } }), null, { now })
  assert.equal(parent.jobs.find((j) => j.role === "main").name, "Bid pack")
  assert.equal(parent.jobs.find((j) => j.name === "Đọc hồ sơ").parent, "Bid pack")
  assert.deepEqual(parent.jobs.find((j) => j.name === "Đọc hồ sơ").workloads, [">15 trang"])
  assert.equal(parent.jobs[0].targetSource, null, "one run is not enough for a baseline target")
})

test("re-detection keeps admin overrides and fills new jobs", () => {
  const first = detectToolProfile(report({ jobHistoryAllTime: { executed: 30, failed: 0, completion: [
    { job: "A", p95Ms: 3 * min, samples: 30 }, { job: "B", p95Ms: 5 * min, samples: 30 }] } }), null, { now })
  const adjusted = { ...first, errorRateTarget: 0.5, errorRateTargetSource: "manual",
    jobs: first.jobs.map((j) => j.name === "B" ? { ...j, role: "main", roleSource: "manual", targetMinutes: 4, targetSource: "manual" } : j) }
  const again = detectToolProfile(report({ jobHistoryAllTime: { executed: 50, failed: 10, completion: [
    { job: "A", p95Ms: 9 * min, samples: 50 }, { job: "B", p95Ms: 9 * min, samples: 50 }, { job: "C", p95Ms: 1000, samples: 50 }] } }), adjusted, { now })
  const b = again.jobs.find((j) => j.name === "B")
  assert.equal(b.role, "main")
  assert.equal(b.targetMinutes, 4)
  assert.equal(again.errorRateTarget, 0.5)
  assert.equal(again.jobs.find((j) => j.name === "A").targetMinutes, 9, "auto targets follow the new baseline")
  assert.equal(again.jobs.find((j) => j.name === "C").role, "sub")
  assert.equal(niceTargetMinutes(47000), 50 / 60)
  assert.equal(niceTargetMinutes(37 * min), 40)
})

test("a declared tool without a data source shows No data, never Đạt", () => {
  const t = evaluateTool({ id: "cv", name: "CV Screening", connected: false, tool: { mainJob: "Chấm 1 CV", jobs: [] } })
  assert.equal(t.status, "nodata")
  assert.equal(t.reason, "Chưa kết nối nguồn dữ liệu")
})

test("main job status uses the worst workload group; saved history beats instrumented data", () => {
  const r = report({
    jobHistory: { executed: 25, failed: 0, unverifiedCompletions: 0, complete: true, completion: [
      { job: "Bid pack", workload: "≤15 trang", p95Ms: 85 * min, samples: 25 },
      { job: "Bid pack", workload: ">15 trang", p95Ms: 210 * min, samples: 25 },
      { job: "Đọc hồ sơ", workload: ">15 trang", p95Ms: 95 * min, samples: 25 },
    ] },
    performanceKpis: { jobCompletion: [{ job: "Bid pack", workload: "x", p95Ms: 1, samples: 99 }] },
  })
  const tool = { mainJob: "Bộ thông tin bid", errorRateTarget: 2, jobs: [
    { name: "Bid pack", role: "main", targetMinutes: 150 },
    { name: "Đọc hồ sơ", role: "sub", targetMinutes: 50 },
    { name: "Câu hỏi client", role: "sub", targetMinutes: 20 },
  ] }
  const t = evaluateTool({ id: "rfp", name: "RFP", tool, result: { status: "ready", report: r } })
  assert.equal(t.source, "history")
  assert.equal(t.status, "bad")
  assert.equal(t.headline.workload, ">15 trang")
  assert.equal(t.jobs.find((j) => j.name === "Câu hỏi client").unmeasured, true)
  const p = priorities([t])
  assert.deepEqual(p.time.map((x) => x.job), ["Đọc hồ sơ", "Bid pack"])
  assert.equal(Math.round(p.time[0].overPercent), 90)
})

test("run-level evaluation scores the Main Job error rate and lists failing sub-jobs separately", () => {
  const runs = []
  for (let i = 0; i < 20; i++) {
    const start = new Date(Date.parse("2026-11-08T18:00:00Z") + i * 60000).toISOString()
    runs.push(run("Thao tác", start, 0.1, i < 1 ? "failed" : "success"))
    runs.push(run("Switch account", start, 0.2, i < 8 ? "failed" : "success", { parent: "Thao tác" }))
  }
  const t = evaluateTool({ id: "li", name: "LinkedIn", days: 1, now, result: { status: "ready", report: report({ jobRuns: { runs } }) },
    tool: { errorRateTarget: 5, minSamples: 10, jobs: [{ name: "Thao tác", role: "main", targetMinutes: 0.2 }, { name: "Switch account", role: "sub", targetMinutes: 0.1 }] } })
  assert.equal(t.error.executed, 20, "tool error rate uses Main Job runs only")
  assert.equal(t.error.status, "ok")
  assert.equal(t.status, "ok")
  const p = priorities([t])
  assert.equal(p.errors[0].job, "Switch account")
  assert.equal(p.time[0].job, "Switch account")
  assert.equal(p.time[0].overRuns, 12)
})

test("missing targets, small samples and empty windows get distinct statuses", () => {
  const r = report({ jobHistory: { executed: 6, failed: 0, unverifiedCompletions: 0,
    completion: [{ job: "Batch", workload: "5 bài", p95Ms: 10 * min, samples: 6 }] } })
  const result = { status: "ready", report: r }
  assert.equal(evaluateTool({ id: "a", name: "A", tool: null, result }).status, "notarget")
  const configured = { errorRateTarget: 2, jobs: [{ name: "Batch", role: "main", targetMinutes: 20 }] }
  assert.equal(evaluateTool({ id: "a", name: "A", tool: configured, result }).status, "insufficient")
  assert.equal(evaluateTool({ id: "a", name: "A", tool: { ...configured, minSamples: 5 }, result }).status, "ok")
  const empty = evaluateTool({ id: "b", name: "B", tool: configured, result: { status: "ready", report: report({ jobHistory: { executed: 0, failed: 0 } }) } })
  assert.equal(empty.status, "nodata")
  assert.deepEqual(summarize([empty]), { bad: 0, insufficient: 0, notarget: 0, nodata: 1, ok: 0 })
})

test("empty windows say whether the app sends job data at all", () => {
  const withRuns = evaluateTool({ id: "w", name: "W", days: 1, now, tool: { jobs: [{ name: "Batch", role: "main", targetMinutes: 10, baselineSamples: 30 }] },
    result: { status: "ready", report: report({ jobRuns: { runs: [run("Batch", "2026-08-01T00:00:00Z", 5)] } }) } })
  assert.equal(withRuns.status, "notarget", "no run in any window, but the recorded run still counts for the success rate")
  assert.deepEqual([withRuns.success.executed, withRuns.latest.durationMs], [1, 5 * min], "success rate and latest finished workload use every recorded run")
  assert.equal(withRuns.jobs[0].unmeasured, true)
  assert.equal(withRuns.headline, null)
  assert.equal(withRuns.mainTargetMinutes, 10, "the Main Job target is still shown without runs in the period")
  const nothing = evaluateTool({ id: "x", name: "X", tool: null, result: { status: "ready", report: report({ runtime: {} }) } })
  assert.equal(nothing.reason, "App chưa gửi số liệu theo job")
})

test("success rate, user latency and run history with sub-job breakdown", async () => {
  const { uxMetric, recentRuns } = await import("../server/tool-performance.js")
  assert.deepEqual(uxMetric({ p95Ms: 85, samples: 30 }, 2500), { p95Ms: 85, samples: 30, targetMs: 2500, status: "ok" })
  assert.equal(uxMetric({ p95Ms: 240, samples: 30 }, 200).status, "bad")
  assert.equal(uxMetric({ p95Ms: 240, samples: 3 }, 200).status, "insufficient")
  assert.equal(uxMetric(null, 200).status, "nodata")
  const runs = [
    { job: "Bid pack", runId: "r1", status: "success", workload: "2 file / 35 trang ToR UNIDO", startedAt: "2026-11-08T18:00:00Z", endedAt: "2026-11-08T18:00:40Z" },
    { job: "Đọc hiểu tài liệu", runId: "s2", parentRunId: "r1", status: "success", startedAt: "2026-11-08T18:00:05Z", endedAt: "2026-11-08T18:00:20Z" },
    { job: "Kiểm tra file", runId: "s1", parentRunId: "r1", status: "success", startedAt: "2026-11-08T18:00:00Z", endedAt: "2026-11-08T18:00:01Z" },
    { job: "Bid pack", runId: "r0", status: "failed", workload: "4 file / 86 trang", startedAt: "2026-11-08T17:00:00Z", endedAt: "2026-11-08T17:01:00Z" },
    { job: "Orphan step", parentRunId: "missing", status: "success", startedAt: "2026-11-08T16:00:00Z", endedAt: "2026-11-08T16:00:01Z" },
  ]
  const r = report({ jobRuns: { runs } })
  const history = recentRuns(r, { mainJob: "Bid pack" })
  assert.deepEqual(history.map((x) => x.runId), ["r1", "r0"], "Main Job runs, newest first")
  assert.deepEqual(history[0].steps.map((s) => [s.job, s.durationMs]), [["Kiểm tra file", 1000], ["Đọc hiểu tài liệu", 15000]])
  assert.equal(history[0].workload, "2 file / 35 trang ToR UNIDO")
  assert.equal(recentRuns(r).length, 3, "without a Main Job every top-level run is listed")
  const t = evaluateTool({ id: "rfp", name: "RFP", days: 1, now, result: { status: "ready", report: { ...r, performanceKpis: { responseTime: { p95Ms: 85, samples: 30 } } } },
    tool: { errorRateTarget: 5, minSamples: 1, responseTargetMs: 2000, jobs: [{ name: "Bid pack", role: "main", targetMinutes: 1 }] } })
  assert.equal(t.success.executed, 2)
  assert.equal(t.success.succeeded, 1)
  assert.equal(t.success.rate, 50)
  assert.equal(t.success.target, 95)
  assert.equal(t.success.status, "bad")
  assert.equal(t.response.targetMs, 2000)
  assert.equal(t.click.status, "nodata")
  assert.equal(t.runs[0].steps.length, 2)
})

test("steps of an unmeasured parent are grouped for display with summed processing time", async () => {
  const { recentRuns } = await import("../server/tool-performance.js")
  const gate = (job, start, seconds, status = "success") => ({ job, parentRunId: "package:p1", workload: "1 package · Ra mắt văn phòng mới", status,
    startedAt: start, endedAt: new Date(Date.parse(start) + seconds * 1000).toISOString() })
  const r = report({ jobRuns: { runs: [
    gate("EB V2 brief", "2026-11-08T10:00:00Z", 10), gate("EB V2 article", "2026-11-08T15:00:00Z", 14, "failed"),
    { job: "EB V2 brief", status: "success", startedAt: "2026-11-07T10:00:00Z", endedAt: "2026-11-07T10:00:09Z" },
  ] } })
  const history = recentRuns(r)
  assert.equal(history.length, 2)
  assert.equal(history[0].group, true)
  assert.equal(history[0].workload, "1 package · Ra mắt văn phòng mới")
  assert.equal(history[0].status, "failed")
  assert.equal(history[0].durationMs, 24000, "summed step time, not the hours of human waiting in between")
  assert.deepEqual(history[0].steps.map((x) => x.job), ["EB V2 brief", "EB V2 article"])
  const profile = detectToolProfile(r, null, { now })
  assert.ok(!profile.jobs.some((j) => j.name.startsWith("package")), "a display group is never detected as a job")
})

test("estimated steps show in run history but never in stats, targets or job detection", async () => {
  const { recentRuns } = await import("../server/tool-performance.js")
  const article = { job: "Writer batch article", runId: "a1", status: "success", workload: "1 SEO article · Old", startedAt: "2026-11-08T10:00:00Z", endedAt: "2026-11-08T10:03:00Z" }
  const step = (job, from, to, extra = {}) => ({ job, runId: "a1:" + job, parentRunId: "a1", parent: "Writer batch article", status: "success",
    workload: article.workload, startedAt: from, endedAt: to, ...extra })
  const r = report({ jobRuns: { complete: true, runs: [
    article,
    step("Lập outline", "2026-11-08T10:00:40Z", "2026-11-08T10:01:20Z", { estimated: true }),
    step("Viết draft & kiểm tra chất lượng", "2026-11-08T10:01:20Z", "2026-11-08T10:03:00Z", { estimated: true }),
  ] } })
  const history = recentRuns(r, { mainJob: "Writer batch article" })
  assert.deepEqual(history[0].steps.map((s) => [s.job, s.durationMs, s.estimated]), [
    ["Lập outline", 40000, true], ["Viết draft & kiểm tra chất lượng", 100000, true]])
  assert.equal(parseRuns(r).runs.length, 1, "stats read measured runs only")
  assert.equal(parseRuns(r).complete, true, "estimated runs are accepted, not dropped")
  const profile = detectToolProfile(r, null, { now })
  assert.deepEqual(profile.jobs.map((j) => j.name), ["Writer batch article"], "estimated step names never become jobs")
  const t = evaluateTool({ id: "ws", name: "Writer", days: 7, now, result: { status: "ready", report: r }, tool: profile })
  assert.equal(t.success.executed, 1)
  assert.equal(t.runs[0].steps.length, 2)
})

test("sub-jobs the app declares are listed in pipeline order before they have runs", async () => {
  const { reportJobNames } = await import("../server/tool-performance.js")
  const steps = ["Nhận bài từ Content Plan", "Nghiên cứu từ khóa SEO", "Article Spec & Core Idea", "Lập outline", "Viết draft", "Kiểm tra chất lượng"]
  const r = report({
    profile: { version: "profile-v1", mainJob: { job: "Writer batch article", steps } },
    jobRuns: { complete: true, runs: [run("Writer batch article", "2026-11-08T10:00:00Z", 3)] },
  })
  assert.deepEqual(reportJobNames(r), ["Writer batch article", ...steps])
  const profile = detectToolProfile(r, null, { now })
  assert.deepEqual(profile.jobs.map((j) => [j.name, j.role, j.parent]), [
    ["Writer batch article", "main", null], ...steps.map((s) => [s, "sub", "Writer batch article"])])
  const t = evaluateTool({ id: "ws", name: "Writer", days: 7, now, result: { status: "ready", report: r }, tool: profile })
  assert.equal(t.jobs.filter((j) => j.unmeasured).length, 6, "declared steps without runs show as not yet measured")
})

test("document names after ' · ' stay in run history while stats and profiles use the workload class", async () => {
  const { workloadClass, recentRuns } = await import("../server/tool-performance.js")
  const { toolConfigSchema } = await import("../server/app-monitoring.js")
  const title = "When to Remake a Video vs Refresh It: A Practical Decision Guide for Marketing and Brand Teams in 2026"
  assert.equal(workloadClass("1 SEO article · " + title), "1 SEO article")
  assert.equal(workloadClass("B2B brief.docx"), "B2B brief.docx")
  const runs = [1, 2, 3].map((i) => run("Writer batch article", "2026-11-08T0" + i + ":00:00Z", 3 + i, "success",
    { runId: "a" + i, workload: "1 SEO article · " + title + " " + i }))
  const r = report({ jobRuns: { complete: true, runs } })
  const units = jobUnitsFor(r, 7, { now }).units
  assert.deepEqual(units.map((u) => [u.workload, u.samples]), [["1 SEO article", 3]], "one unit with every article, not one per title")
  const profile = detectToolProfile(r, null, { now })
  assert.deepEqual(profile.jobs[0].workloads, ["1 SEO article"])
  assert.doesNotThrow(() => toolConfigSchema.parse(profile), "a profile built from long article titles is storable")
  assert.ok(recentRuns(r)[0].workload.endsWith(title + " 3"), "run history keeps the article title")
})

test("sub-job popover averages measured steps over recent runs and shows each step's share", async () => {
  const { stepAverages } = await import("../src/tool-format.js")
  const step = (job, ms, extra = {}) => ({ job, status: "success", durationMs: ms, ...extra })
  const tool = {
    jobs: [{ name: "Lead", role: "main" }, { name: "Clean", role: "sub" }, { name: "Write", role: "sub", targetMinutes: 0.5 }, { name: "Review", role: "sub" }],
    runs: [
      { job: "Lead", steps: [step("Clean", 50), step("Write", 20000)] },
      { job: "Lead", steps: [step("Clean", 70), step("Write", 40000), step("Review", 1000, { status: "failed" })] },
      { job: "Lead", steps: [step("Write", 99999, { estimated: true })] },
    ],
  }
  const { rows, totalMs, runs } = stepAverages(tool)
  assert.deepEqual(rows.map((r) => [r.name, r.averageMs, r.samples]), [["Clean", 60, 2], ["Write", 30000, 2], ["Review", null, 0]],
    "failed and estimated steps are not averaged")
  assert.equal(totalMs, 30060)
  assert.equal(runs, 2)
  assert.equal(Math.round(rows[1].share * 100), 100)
  assert.equal(stepAverages({ jobs: [{ name: "Only", role: "main" }], runs: [] }).totalMs, null)
})

test("with a Main Job, run history also lists unscored groups such as packages awaiting approval", async () => {
  const { recentRuns } = await import("../server/tool-performance.js")
  const r = report({ jobRuns: { complete: true, runs: [
    { job: "EB V2 package", runId: "package:done", status: "success", workload: "1 package · Done", startedAt: "2026-11-08T10:00:00Z", endedAt: "2026-11-08T10:01:00Z" },
    { job: "Trích xuất brief", runId: "g1", parentRunId: "package:done", status: "success", startedAt: "2026-11-08T10:00:00Z", endedAt: "2026-11-08T10:00:05Z" },
    { job: "Trích xuất brief", runId: "g2", parentRunId: "package:wait", parent: "EB V2 package", status: "success", workload: "1 package · Waiting", startedAt: "2026-11-09T09:00:00Z", endedAt: "2026-11-09T09:00:04Z" },
    { job: "Other top-level job", runId: "x", status: "success", startedAt: "2026-11-09T08:00:00Z", endedAt: "2026-11-09T08:00:01Z" },
  ] } })
  const history = recentRuns(r, { mainJob: "EB V2 package" })
  assert.deepEqual(history.map((h) => [h.runId, h.group === true]), [["package:wait", true], ["package:done", false]])
  assert.equal(history[0].durationMs, 4000, "a group shows its summed processing time")
})

test("run history groups repeated sub-job runs into one chip with count and summed time", async () => {
  const { groupSteps } = await import("../src/tool-format.js")
  const s = (job, ms, extra = {}) => ({ job, status: "success", durationMs: ms, ...extra })
  const groups = groupSteps([s("Brief", 2700), s("Spec", 9300), s("Spec", 8100), s("Draft", 7400), s("Spec", null, { status: "failed" }), s("Channel", 5000, { estimated: true })])
  assert.deepEqual(groups.map((g) => [g.job, g.count, g.totalMs, g.failed, g.estimated]), [
    ["Brief", 1, 2700, false, false], ["Spec", 3, 17400, true, false], ["Draft", 1, 7400, false, false], ["Channel", 1, 5000, false, true]])
})

test("an empty period shows the latest Main Job run, and an app-declared success target applies without a baseline", async () => {
  const runs = [
    { job: "EB V2 package", runId: "p1", status: "success", startedAt: "2026-10-26T03:59:00Z", endedAt: "2026-10-26T04:00:15Z" },
    { job: "EB V2 package", runId: "p0", status: "success", startedAt: "2026-10-23T09:53:00Z", endedAt: "2026-10-23T09:54:07Z" },
  ]
  const r = report({ profile: { version: "profile-v1", mainJob: { job: "EB V2 package", steps: [] }, errorRateTarget: 1 }, jobRuns: { complete: true, runs } })
  const profile = detectToolProfile(r, null, { now })
  assert.deepEqual([profile.errorRateTarget, profile.errorRateTargetSource], [1, "app"], "fewer runs than the minimum: the app's target is used")
  const t = evaluateTool({ id: "ic", name: "Intercom", days: 7, now, result: { status: "ready", report: r }, tool: profile })
  assert.deepEqual([t.widened, t.windowDays, t.headline?.samples, t.success.executed], [true, 30, 2, 2],
    "nothing finished in the last 7 days: the summary uses the last 30 days")
  assert.deepEqual(t.latest, { workload: "", durationMs: 75000, at: Date.parse("2026-10-26T04:00:15Z") }, "the latest finished run headlines the row")
  assert.equal(t.success.target, 99)
  const old = report({ ...r, jobRuns: { complete: true, runs: runs.map((x) => ({ ...x, startedAt: x.startedAt.replace("2026-10", "2026-08"), endedAt: x.endedAt.replace("2026-10", "2026-08") })) } })
  const stale = evaluateTool({ id: "ic", name: "Intercom", days: 7, now, result: { status: "ready", report: old }, tool: profile })
  assert.deepEqual([stale.headline, stale.widened], [null, false], "older than 61 days: no period metrics")
  assert.equal(stale.latest.durationMs, 75000, "the latest run is still shown")
  const manual = evaluateTool({ id: "ic", name: "Intercom", days: 7, now, result: { status: "ready", report: r }, tool: { ...profile, errorRateTarget: 5, errorRateTargetSource: "manual" } })
  assert.equal(manual.success.target, 95, "an admin target wins")
  const withRun = evaluateTool({ id: "ic", name: "Intercom", days: 30, now, result: { status: "ready", report: r }, tool: profile })
  assert.equal(withRun.widened, false)
  const pending = evaluateTool({ id: "ic", name: "Intercom", days: 7, now, tool: profile, result: { status: "ready", report: report({ ...r, jobRuns: { complete: true, runs: [...runs,
    { job: "Trích xuất brief", runId: "g9", parentRunId: "package:new", parent: "EB V2 package", status: "success", workload: "1 package · KPI test", startedAt: "2026-11-06T06:12:31Z", endedAt: "2026-11-06T06:12:34Z" }] } }) } })
  assert.equal(pending.latest.at, Date.parse("2026-10-26T04:00:15Z"), "a package awaiting approval is not a finished workload")
  const running = evaluateTool({ id: "ic", name: "Intercom", days: 7, now, tool: profile, result: { status: "ready", report: report({ ...r, jobRuns: { complete: true, runs: [...runs,
    { job: "EB V2 package", runId: "live", status: "running", startedAt: new Date(now - 30000).toISOString(), endedAt: null }] } }) } })
  assert.equal(running.latest.durationMs, 75000, "a running Main Job is not a finished workload")
  const failedLast = evaluateTool({ id: "ic", name: "Intercom", days: 7, now, tool: profile, result: { status: "ready", report: report({ ...r, jobRuns: { complete: true, runs: [...runs,
    { job: "EB V2 package", runId: "bad", status: "failed", startedAt: "2026-11-08T10:00:00Z", endedAt: "2026-11-08T10:00:20Z" }] } }) } })
  assert.deepEqual([failedLast.latest.durationMs, failedLast.success.executed, failedLast.success.succeeded], [75000, 3, 2],
    "a failed run is not a completion, but counts in the success rate over every recorded run")
})

test("browser KPIs show what the app says it measures", () => {
  const r = report({ profile: { version: "profile-v1", kpiDescriptions: { responseTime: "Bấm 'Tạo outline' → outline đã lưu hiển thị", clickLatency: 42 } },
    performanceKpis: { responseTime: { p95Ms: 10000, samples: 1 }, clickLatency: { p95Ms: 500, samples: 2 } } })
  const t = evaluateTool({ id: "w", name: "W", days: 7, now, result: { status: "ready", report: r }, tool: null })
  assert.equal(t.response.measures, "Bấm 'Tạo outline' → outline đã lưu hiển thị")
  assert.equal(t.click.measures, null, "malformed descriptions are dropped")
})

test("every tool's summary has targets: a default success target and a provisional time target", async () => {
  const { defaultErrorRateTarget } = await import("../server/tool-performance.js")
  const runs = [
    { job: "Tạo 2 phiên bản script", runId: "a", status: "success", startedAt: "2026-11-08T10:00:00Z", endedAt: "2026-11-08T10:00:27.6Z" },
    { job: "Tạo 2 phiên bản script", runId: "b", status: "success", startedAt: "2026-11-08T11:00:00Z", endedAt: "2026-11-08T11:00:20Z" },
  ]
  const r = report({ profile: { version: "profile-v1", mainJob: { job: "Tạo 2 phiên bản script", steps: [] } }, jobRuns: { complete: true, runs } })
  const profile = detectToolProfile(r, null, { now })
  const t = evaluateTool({ id: "se", name: "Script Engine", days: 7, now, result: { status: "ready", report: r }, tool: profile })
  assert.deepEqual([t.success.target, t.success.targetDefault], [100 - defaultErrorRateTarget, true], "no admin/app/baseline target: the Lab default applies")
  assert.deepEqual([t.timeTarget, t.timeTargetProvisional], [0.5, true], "P95 27.6s rounded up to 30s")
  const own = evaluateTool({ id: "se", name: "Script Engine", days: 7, now, result: { status: "ready", report: r },
    tool: { ...profile, errorRateTarget: 1, jobs: profile.jobs.map((j) => (j.role === "main" ? { ...j, targetMinutes: 2 } : j)) } })
  assert.deepEqual([own.success.target, own.success.targetDefault, own.timeTarget, own.timeTargetProvisional], [99, false, 2, false], "own targets win")
})
