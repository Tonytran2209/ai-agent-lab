import React, { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronRight, ChevronUp, CircleCheck, CircleDashed, CircleHelp, CircleAlert, ExternalLink, X, GitCommitHorizontal, Plus, Settings2, ShieldCheck, ShieldAlert, Trash2, Layers, LoaderCircle } from "lucide-react"
import { evaluateTool, priorities, statusOrder } from "../server/tool-performance.js"
import { formatTime, formatPercent, timeAgo, compactTime, clockDate, stepAverages, groupSteps } from "./tool-format.js"
import { ConnectToolForm, Drawer, ToolSettings } from "./ToolManager.jsx"
import "./tool-overview.css"

export { formatTime }

const minutesText = (m) => (m == null ? null : compactTime(m * 60000))
const sourceLabels = {
  runs: "Tính từ từng lần chạy, theo giờ VN",
  history: "Từ lịch sử job app đã lưu (kỳ theo ngày UTC)",
  instrumented: "Từ số liệu đo trực tiếp của app (kỳ theo ngày UTC)",
}
const hints = {
  tool: "Tool và Main Job: công việc trọn vẹn mà người dùng nhận được kết quả. Lab tự nhận diện từ dữ liệu thật.",
  status: "Trạng thái vận hành: Lab đọc được báo cáo của tool hay không, và lần báo cáo gần nhất. Màu của từng chỉ số cho biết đạt (xanh) hay chưa đạt (đỏ) target.",
  time: "P95 thời gian hoàn thành Main Job trong kỳ: 95% lần chạy xong nhanh hơn mức này. Chỉ chấm khi đủ số mẫu tối thiểu.",
  success: "Tỷ lệ lần chạy thành công: không lỗi kỹ thuật, không thất bại nghiệp vụ, không quá thời gian chờ (3 × target).",
  response: "P95 từ lúc người dùng gửi yêu cầu đến phản hồi có ý nghĩa đầu tiên.",
  click: "P95 từ lúc bấm đến khi giao diện phản hồi.",
}
const toneOf = (status) => ({ ok: "good", bad: "bad" })[status] || "muted"

function Hint({ text }) {
  return (
    <span className="tool-hint" tabIndex={0} aria-label={text}>
      <CircleHelp size={13} aria-hidden="true" />
      <span role="tooltip">{text}</span>
    </span>
  )
}

// Operational state, separate from the target result: can Lab read the tool, and since when.
function operational(t) {
  if (!t.connected) return { label: "Chưa kết nối", tone: "muted" }
  if (t.appStatus === "ready") return { label: "Operational", tone: "good" }
  if (t.appStatus === "degraded") return { label: "Degraded", tone: "warn" }
  if (t.appStatus === "unauthorized") return { label: "Sai token", tone: "bad" }
  return { label: "Mất tín hiệu", tone: "bad" }
}

const opIcons = { good: CircleCheck, warn: CircleAlert, bad: CircleAlert, muted: CircleHelp }
function OpPill({ op }) {
  const Icon = opIcons[op.tone] || CircleHelp
  return <span className={"tool-op " + op.tone}><Icon size={15} aria-hidden="true" />{op.label}</span>
}

function MetricCell({ value, tone, target, note }) {
  return (
    <>
      <strong className={"tool-metric " + tone}>{value}</strong>
      {target && <small>{target}</small>}
      {note && <small className="tool-dim">{note}</small>}
    </>
  )
}

function Trend({ unit }) {
  if (unit?.previousP95Ms == null || unit.p95Ms == null) return null
  const d = unit.p95Ms - unit.previousP95Ms
  if (Math.abs(d) < 500) return <small className="tool-dim">So với kỳ trước: không đổi</small>
  return <small className={d > 0 ? "tool-worse" : "tool-better"}>So với kỳ trước: {d > 0 ? "+" : "−"}{compactTime(Math.abs(d))}</small>
}

function RunHistory({ tool }) {
  const [expanded, setExpanded] = useState(() => new Set())
  if (!tool.runs.length)
    return <p className="tool-note">{tool.source === "runs" ? "Chưa có lần chạy nào trong 61 ngày gần đây." : "App chưa gửi từng lần chạy (jobRuns), nên chưa có lịch sử."}</p>
  const jobs = new Map(tool.jobs.map((j) => [j.name, j]))
  const over = (job, ms) => jobs.get(job)?.targetMinutes && ms > jobs.get(job).targetMinutes * 60000
  const stepHint = (name, estimated) => {
    if (estimated) return name + " · Ước tính từ thời điểm gọi AI của bài (bài chạy trước khi app lưu thời gian từng bước). Không tính vào P95 và target."
    const j = jobs.get(name), u = j?.units?.[0]
    return [name, j?.targetMinutes ? "Target ≤ " + minutesText(j.targetMinutes) : "Chưa có target",
      u?.p95Ms != null ? "P95 trong kỳ " + compactTime(u.p95Ms) + " · " + u.samples + " mẫu" : null].filter(Boolean).join(" · ")
  }
  const statusIcon = { success: ShieldCheck, failed: ShieldAlert, running: LoaderCircle }
  return (
    <div className="perf-table-scroll">
      <table className="tool-runs">
        <thead>
          <tr><th scope="col">Thời gian</th><th scope="col">Workload / Tài liệu</th><th scope="col">Thời lượng</th><th scope="col">Chi tiết từng Sub-job</th><th scope="col" className="tool-end">Trạng thái</th></tr>
        </thead>
        <tbody>
          {tool.runs.map((r, i) => {
            const Icon = statusIcon[r.status] || LoaderCircle, at = r.endedAt ?? r.startedAt
            return (
              <tr key={(r.runId || "") + i}>
                <td className="tool-when"><span>{clockDate(at)}</span><small className="tool-dim">{timeAgo(new Date(at).toISOString())}{r.job && tool.jobs.length > 1 && !r.steps.length ? " · " + r.job : ""}</small></td>
                <td className="tool-workload" title={r.workload}>{r.workload || "—"}</td>
                <td>
                  <span className={!r.group && over(r.job, r.durationMs) ? "tool-metric bad" : "tool-metric good"}>{compactTime(r.durationMs)}</span>
                  {r.group && <small className="tool-dim">Tổng các bước</small>}
                </td>
                <td>
                  {r.steps.length ? (() => {
                    const key = (r.runId || "") + i, open = expanded.has(key), groups = groupSteps(r.steps)
                    const toggle = () => setExpanded((old) => { const next = new Set(old); next.has(key) ? next.delete(key) : next.add(key); return next })
                    const chipTitle = (g) => [stepHint(g.job, g.estimated),
                      g.count > 1 ? g.count + " lần chạy: " + g.runs.map((x) => x.status === "failed" ? "lỗi" : compactTime(x.durationMs)).join(", ") : null].filter(Boolean).join(" · ")
                    return (
                      <div className="tool-steps-cell">
                        {!open && (
                          <ul className="tool-step-chips" aria-label="Sub-job của lần chạy">
                            {groups.map((g) => (
                              <li key={g.job} title={chipTitle(g)} aria-label={chipTitle(g)}
                                className={g.estimated ? "estimated" : g.failed ? "failed" : g.runs.some((x) => over(x.job, x.durationMs)) ? "slow" : ""}>
                                <span className="tool-step-name">{g.job}</span>
                                {g.count > 1 && <span className="tool-step-count">×{g.count}</span>}
                                <span className="tool-step-time">{g.running && g.totalMs == null ? "…" : (g.estimated ? "~" : "") + compactTime(g.totalMs)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {open && (
                    <ul className="tool-steps">
                      {r.steps.map((s, k) => (
                        <li key={k} className={s.estimated ? "estimated" : s.status === "failed" ? "failed" : over(s.job, s.durationMs) ? "slow" : ""}>
                          <span><b>{s.job}</b><Hint text={stepHint(s.job, s.estimated)} />{s.estimated && <small className="tool-dim"> · ước tính</small>}{s.workload && s.workload !== r.workload ? <small className="tool-dim"> · {s.workload}</small> : null}</span>
                          <span>{s.status === "failed" ? "Lỗi" : s.status === "running" ? "Đang chạy" : (s.estimated ? "~" : "") + compactTime(s.durationMs)}</span>
                        </li>
                      ))}
                    </ul>
                        )}
                        {(open || groups.some((g) => g.count > 1)) && (
                          <button type="button" className="text-button tool-steps-toggle" aria-expanded={open} onClick={toggle}>
                            {open ? "Thu gọn" : "Xem " + r.steps.length + " lần chạy theo thứ tự"}
                          </button>
                        )}
                      </div>
                    )
                  })() : <span className="tool-dim">—</span>}
                </td>
                <td className="tool-end"><span className={"tool-run-status " + r.status}><Icon size={14} aria-hidden="true" />{r.status === "success" ? "Thành công" : r.status === "failed" ? "Thất bại" : "Đang chạy"}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SubJobMenu({ tool, label, onOpenRuns }) {
  const [open, setOpen] = useState(false), [pos, setPos] = useState(null)
  const buttonRef = useRef(null), panelRef = useRef(null)
  // The panel is portalled to <body> with fixed position: inside the table's scroll container it
  // was clipped and made the whole Status table scroll.
  const place = () => {
    const b = buttonRef.current?.getBoundingClientRect()
    if (!b) return
    const width = Math.min(400, window.innerWidth - 16), height = panelRef.current?.offsetHeight || 360
    const left = Math.max(8, Math.min(b.left, window.innerWidth - width - 8))
    const below = window.innerHeight - b.bottom - 8 >= height || b.top < height + 16
    setPos({ left, width, top: below ? b.bottom + 6 : Math.max(8, b.top - height - 6) })
  }
  useLayoutEffect(() => {
    if (!open) return undefined
    place()
    const close = (e) => { if (!panelRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", key)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", key)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open])
  useLayoutEffect(() => { if (open) place() }, [open, tool])
  const { rows, totalMs, runs } = stepAverages(tool)
  const hint = (r) => [r.name, r.job?.targetMinutes ? "Target ≤ " + minutesText(r.job.targetMinutes) : "Chưa có target",
    r.job?.units?.[0]?.p95Ms != null ? "P95 trong kỳ " + compactTime(r.job.units[0].p95Ms) : null,
    r.samples ? "Trung bình trên " + r.samples + " lần chạy gần nhất" : "Chưa có lần chạy đo được"].filter(Boolean).join(" · ")
  const over = (r) => r.job?.targetMinutes && r.averageMs != null && r.averageMs > r.job.targetMinutes * 60000
  return (
    <span className="tool-subjob-menu">
      <button ref={buttonRef} type="button" className="tool-subjobs" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        <Layers size={13} aria-hidden="true" /> {label} {open ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
      </button>
      {open && createPortal(
        <div ref={panelRef} className="tool-subjob-panel" role="dialog" aria-label={"Thời lượng trung bình từng bước của " + tool.name}
          style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden" }}>
          <header>
            <Layers size={16} aria-hidden="true" />
            <b>Thời lượng trung bình từng bước</b>
            <span className="tool-dim">{runs} lượt chạy</span>
            <button type="button" className="icon-button" aria-label="Đóng" onClick={() => { setOpen(false); buttonRef.current?.focus() }}><X size={15} /></button>
          </header>
          <ul>
            {rows.filter((r) => r.averageMs != null).map((r) => {
              const Icon = over(r) ? CircleAlert : CircleCheck
              return (
                <li key={r.name} className={over(r) ? "slow" : ""}>
                  <Icon size={16} aria-hidden="true" />
                  <span className="tool-subjob-name"><b>{r.name}</b><Hint text={hint(r)} /></span>
                  <span className="tool-subjob-share">{r.share == null ? "" : Math.round(r.share * 100) + "%"}</span>
                  <span className="tool-subjob-avg">{r.averageMs == null ? "—" : compactTime(r.averageMs)}</span>
                </li>
              )
            })}
          </ul>
          {rows.some((r) => r.averageMs == null) && (
            <p className="tool-subjob-unmeasured">
              <CircleDashed size={13} aria-hidden="true" />
              <span>Chưa có lần chạy đo được: {rows.filter((r) => r.averageMs == null).map((r) => r.name).join(", ")}</span>
            </p>
          )}
          <footer>
            <span>Tổng trung bình các bước:</span>
            <b>{compactTime(totalMs)}</b>
          </footer>
          {onOpenRuns && (
            <button type="button" className="text-button tool-subjob-link" onClick={() => { setOpen(false); onOpenRuns() }}>
              Xem lịch sử chi tiết các lần chạy <ExternalLink size={13} aria-hidden="true" />
            </button>
          )}
        </div>,
        document.body,
      )}
    </span>
  )
}

function Deploys({ deploys, linked }) {
  if (!linked) return <p className="tool-note">Chưa liên kết Railway service. Mở ⚙ → Kết nối → Railway service để hiện sự kiện deploy.</p>
  if (deploys?.error) return <p className="tool-note">Không đọc được sự kiện deploy: {deploys.error}</p>
  if (!deploys?.items?.length) return <p className="tool-note">Chưa có lần deploy nào.</p>
  return (
    <div className="perf-table-scroll">
      <table className="tool-runs">
        <thead><tr><th scope="col">Thời gian</th><th scope="col">Trạng thái</th><th scope="col">Commit</th></tr></thead>
        <tbody>
          {deploys.items.map((d) => (
            <tr key={d.id}>
              <td className="tool-when"><span>{clockDate(Date.parse(d.createdAt))}</span><small className="tool-dim">{timeAgo(d.createdAt)}</small></td>
              <td><span className={"tool-run-status " + (d.status === "SUCCESS" ? "success" : ["FAILED", "CRASHED"].includes(d.status) ? "failed" : "running")}>{d.status}</span></td>
              <td>{d.commitHash ? <code>{d.commitHash.slice(0, 7)}</code> : "—"} {d.commitMessage && <span className="tool-dim">{d.commitMessage}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ToolDetail({ tool, deploys, onOpenReport, initialTab }) {
  const [tab, setTab] = useState(initialTab === "deploys" ? "deploys" : "runs")
  const tabs = [
    ["runs", Layers, "Lịch sử các lần chạy gần đây (" + tool.runs.length + ")"],
    ["deploys", GitCommitHorizontal, "Sự kiện Railway Webhook" + (deploys?.items ? " (" + deploys.items.length + ")" : "")],
  ]
  return (
    <div className="tool-detail">
      <div className="tool-tabs" role="tablist">
        {tabs.map(([id, Icon, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={15} aria-hidden="true" />{label}</button>
        ))}
        <code className="tool-id" title={sourceLabels[tool.source] || ""}>Tool ID: {tool.id}</code>
      </div>
      {tab === "runs" && <RunHistory tool={tool} />}
      {tab === "deploys" && <Deploys deploys={deploys} linked={tool.railwayLinked} />}
      {tool.connected && tool.appStatus && <button type="button" className="text-button tool-report-link" onClick={() => onOpenReport(tool.id)}>Xem báo cáo kỹ thuật của app →</button>}
    </div>
  )
}

function PriorityList({ items, kind, decisions, api, onChanged, busy, setBusy, setError }) {
  const keyOf = (p) => [kind, p.toolId, p.job || ""].join("|")
  async function decide(p, status) {
    setBusy(true)
    try {
      await api("/monitoring/priorities", { method: "POST", body: JSON.stringify({ key: keyOf(p), toolId: p.toolId, job: p.job || "", kind, status }) })
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  if (!items.length) return <p className="tool-dim">{kind === "time" ? "Không có job nào chậm hơn target." : "Không có tool nào dưới mục tiêu thành công."}</p>
  return (
    <ol className="tool-priority">
      {items.map((p, i) => {
        const d = decisions.find((x) => x.key === keyOf(p) && x.status === "open")
        return (
          <li key={keyOf(p) + i} className={d ? "decided" : ""}>
            <span><b>{p.job || "Main Job"}</b> · {p.tool}{p.workload ? " · " + p.workload : ""}</span>
            <span className="tool-metric bad">{kind === "time" ? "+" + Math.round(p.overPercent) + "%" : formatPercent(100 - p.rate)}</span>
            <small className="tool-dim">
              {kind === "time"
                ? compactTime(p.p95Ms) + " / target " + minutesText(p.targetMinutes) + " · " + p.samples + " mẫu" + (p.overRuns ? " · " + p.overRuns + " lần vượt" : "")
                : (p.executed - p.failed) + "/" + p.executed + " lượt thành công · mục tiêu ≥ " + formatPercent(100 - p.target)}
            </small>
            {api && (
              <span className="tool-priority-actions">
                {d ? (
                  <>
                    <small>Đã ưu tiên bởi {d.decidedBy} · {timeAgo(d.decidedAt)}</small>
                    <button type="button" className="text-button" disabled={busy} onClick={() => decide(p, "done")}>Hoàn tất</button>
                  </>
                ) : <button type="button" className="text-button" disabled={busy} onClick={() => decide(p, "open")}>Ghi nhận ưu tiên</button>}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function ToolOverview({ data, days = 7, api, onOpenReport, onChanged = () => {} }) {
  const [open, setOpen] = useState(null),
    [drawer, setDrawer] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const results = new Map((data.targets || []).map((t) => [t.id, t]))
  const listed = data.tools || data.targets.map((t) => ({ id: t.id, name: t.name, connected: true, tool: null }))
  const tools = listed
    .map((t) => ({ ...evaluateTool({ ...t, result: results.get(t.id), days }), listed: t, railwayLinked: Boolean(t.railway) }))
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name))
  const todo = priorities(tools)
  const decisions = data.priorities || []
  const full = listed.length >= (data.max || 12)
  async function remove(t) {
    setBusy(true)
    setError("")
    try {
      await api("/settings/monitoring/" + encodeURIComponent(t.id), { method: "DELETE" })
      setConfirmDelete(null)
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const editing = drawer && drawer !== "new" ? listed.find((t) => t.id === drawer) : null

  return (
    <section className="tool-overview" aria-labelledby="tool-overview-title">
      <div className="tool-toolbar">
        {api && <button type="button" className="button primary" disabled={full} onClick={() => setDrawer("new")}><Plus size={15} aria-hidden="true" /> Kết nối tool</button>}
      </div>
      {error && <p className="perf-error" role="alert">{error}</p>}

      <article className="perf-card tool-card">
        <h3 id="tool-overview-title" className="sr-only">Tool theo Main Job</h3>
        {!tools.length && <p className="perf-empty">Chưa có tool nào. Bấm Kết nối tool để thêm tool đầu tiên.</p>}
        {tools.length > 0 && (
          <div className="perf-table-scroll">
            <table className="tool-table">
              <thead>
                <tr>
                  <th scope="col">Công cụ & Nghiệp vụ <Hint text={hints.tool} /></th>
                  <th scope="col">Trạng thái <Hint text={hints.status} /></th>
                  <th scope="col">Thời gian hoàn thành <Hint text={hints.time} /></th>
                  <th scope="col">Tỷ lệ thành công <Hint text={hints.success} /></th>
                  <th scope="col">Tốc độ phản hồi <Hint text={hints.response} /></th>
                  <th scope="col">Độ nhạy thao tác <Hint text={hints.click} /></th>
                  <th scope="col"><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => {
                  const op = operational(t), u = t.headline, deploys = data.deploys?.[t.id]
                  const timeTarget = u?.targetMinutes || t.mainTargetMinutes
                  const subCount = t.jobs.filter((j) => j.role !== "main").length
                  return (
                    <React.Fragment key={t.id}>
                      <tr className={"tool-row" + (open?.id === t.id ? " selected" : "")}>
                        <th scope="row">
                          <button type="button" className="tool-name" aria-expanded={open?.id === t.id} onClick={() => setOpen(open?.id === t.id ? null : { id: t.id, tab: "runs" })}>
                            {open?.id === t.id ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                            <span>
                              <b>{t.name}</b>
                              <small>{t.description || t.mainJob || (t.jobCount > 1 ? "Chưa có job tổng · chấm theo " + t.jobCount + " job" : "Chưa có dữ liệu để nhận diện")}</small>
                              <code>{(t.success.executed ?? 0) + " runs"}{deploys?.items ? " · " + deploys.items.length + " deploys" : ""}{t.owner ? " · " + t.owner : ""}</code>
                            </span>
                          </button>
                        </th>
                        <td>
                          <OpPill op={op} />
                          <small className="tool-dim">{t.reportedAt ? timeAgo(t.reportedAt) : t.reason || ""}</small>
                        </td>
                        <td>
                          {(() => {
                            // Headline: the latest run, finished or not; the period P95 follows.
                            const l = t.latest
                            const tone = !l || l.durationMs == null ? "muted" : l.state === "failed" ? "bad" : l.state === "pending" ? "muted"
                              : timeTarget && l.durationMs > timeTarget * 60000 ? "bad" : "good"
                            const stateText = { success: "Hoàn thành", failed: "Thất bại", pending: "Chưa hoàn thành" }
                            return (
                              <MetricCell value={l ? compactTime(l.durationMs) : "—"} tone={tone}
                                target={timeTarget ? "Mục tiêu: ≤ " + minutesText(timeTarget) : "Chưa có mục tiêu"}
                                note={l ? "Lần gần nhất · " + stateText[l.state] + (l.at != null ? " · " + timeAgo(new Date(l.at).toISOString()) : "") : t.reason} />
                            )
                          })()}
                          {u && (
                            <small className="tool-dim" title={u.medianMs != null ? "Trung vị " + compactTime(u.medianMs) + " · chậm nhất " + compactTime(u.maxMs) : undefined}>
                              P95 {t.widened ? t.windowDays + " ngày gần nhất" : "trong kỳ"}: <b className={"tool-metric inline " + toneOf(u.status)}>{compactTime(u.p95Ms)}</b> · {u.samples} mẫu{u.samples < t.minSamples ? " (cần ≥ " + t.minSamples + ")" : ""}{!t.hasMain && t.jobCount > 1 ? " · " + u.job : ""}
                            </small>
                          )}
                          <Trend unit={u} />
                          {t.jobs.length > 0 && <SubJobMenu tool={t} label={t.hasMain && subCount ? subCount + " sub-jobs" : t.jobs.length + " jobs"} onOpenRuns={() => setOpen({ id: t.id, tab: "runs" })} />}
                        </td>
                        <td>
                          <MetricCell value={t.success.rate == null ? "—" : formatPercent(t.success.rate) + (t.success.status === "ok" ? " OK" : "")} tone={toneOf(t.success.status)}
                            target={t.success.target == null ? "Chưa có mục tiêu" : "Mục tiêu: ≥ " + formatPercent(t.success.target)}
                            note={t.success.executed ? "Đo trên " + t.success.executed + " lượt chạy" + (t.widened ? " · " + t.windowDays + " ngày gần nhất" : " trong kỳ") + (t.success.timedOut ? " · " + t.success.timedOut + " quá thời gian chờ" : "") : null} />
                        </td>
                        <td>
                          <MetricCell value={compactTime(t.response.p95Ms)} tone={toneOf(t.response.status)} target={"Mục tiêu: ≤ " + compactTime(t.response.targetMs)}
                            note={t.response.samples ? t.response.samples + " mẫu" : "App chưa đo"} />
                        </td>
                        <td>
                          <MetricCell value={compactTime(t.click.p95Ms)} tone={toneOf(t.click.status)} target={"Mục tiêu: ≤ " + compactTime(t.click.targetMs)}
                            note={t.click.samples ? t.click.samples + " mẫu" : "App chưa đo"} />
                        </td>
                        <td className="tool-actions">
                          {api && <button type="button" className="icon-button" aria-label={"Cài đặt " + t.name} title="Cài đặt" onClick={() => setDrawer(t.id)}><Settings2 size={17} /></button>}
                          {api && (t.listed.source === "environment"
                            ? <button type="button" className="icon-button" disabled aria-label="Xóa trong biến môi trường Railway" title="Tool cấu hình bằng LAB_MONITORING_TARGETS; xóa trong Railway"><Trash2 size={17} /></button>
                            : confirmDelete === t.id
                              ? <span className="tool-confirm"><button type="button" className="button danger" disabled={busy} onClick={() => remove(t)}>Xóa</button><button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(null)}>Hủy</button></span>
                              : <button type="button" className="icon-button" aria-label={"Xóa " + t.name} title="Xóa tool" onClick={() => setConfirmDelete(t.id)}><Trash2 size={17} /></button>)}
                        </td>
                      </tr>
                      {open?.id === t.id && (
                        <tr className="tool-detail-row">
                          <td colSpan={7}><ToolDetail key={open.tab} tool={t} deploys={deploys} initialTab={open.tab} onOpenReport={onOpenReport} /></td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="perf-card">
        <div className="perf-card-heading">
          <div>
            <h3>Điểm cần tối ưu · {todo.time.length + todo.errors.length}</h3>
            <p>Lab liệt kê từ số liệu; Tech/Lead chọn điểm sẽ tối ưu bằng "Ghi nhận ưu tiên". Thời gian và thành công xếp riêng vì không so sánh trực tiếp được.</p>
          </div>
        </div>
        <div className="tool-priority-grid">
          <div>
            <h4>Chậm hơn target <small className="tool-dim">· xếp theo % vượt</small></h4>
            <PriorityList items={todo.time} kind="time" decisions={decisions} api={api} onChanged={onChanged} busy={busy} setBusy={setBusy} setError={setError} />
          </div>
          <div>
            <h4>Dưới mục tiêu thành công <small className="tool-dim">· xếp theo số lần lỗi</small></h4>
            <PriorityList items={todo.errors} kind="error" decisions={decisions} api={api} onChanged={onChanged} busy={busy} setBusy={setBusy} setError={setError} />
          </div>
        </div>
      </article>

      {drawer === "new" && (
        <Drawer title="Kết nối tool" onClose={() => setDrawer(null)}>
          <ConnectToolForm api={api} full={full} onCancel={() => setDrawer(null)} onSaved={() => { setDrawer(null); onChanged() }} />
        </Drawer>
      )}
      {editing && (
        <Drawer title={"Cài đặt · " + editing.name} onClose={() => setDrawer(null)}>
          <ToolSettings api={api} target={editing} onChanged={() => onChanged()} onClose={() => setDrawer(null)} />
        </Drawer>
      )}
    </section>
  )
}
