import React, { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronRight, ChevronUp, CircleCheck, CircleDashed, CircleHelp, CircleAlert, ExternalLink, X, Plus, Settings2, ShieldCheck, ShieldAlert, Trash2, Layers, LoaderCircle } from "lucide-react"
import { evaluateTool, statusOrder, statusLabels } from "../server/tool-performance.js"
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
  status: "Dòng trên: trạng thái vận hành (Lab đọc được báo cáo của tool hay không). Dòng dưới: kết quả so với mục tiêu của Main Job (thời gian hoàn thành và tỷ lệ thành công) trong kỳ.",
  time: "P95 thời lượng Main Job trong kỳ: 95% lượt chạy thành công xong nhanh hơn mức này. Kỳ không có lượt nào thì dùng 30 hoặc 61 ngày gần nhất (ghi rõ dưới số). Lượt hoàn thành gần nhất xem trong tooltip.",
  success: "Tỷ lệ thành công trong cùng kỳ với thời gian hoàn thành, gồm cả lỗi kỹ thuật và thất bại nghiệp vụ. Khi app báo đơn vị nghiệp vụ (ví dụ hồ sơ LinkedIn đã được nền tảng xác nhận), tỷ lệ tính trên đơn vị đó thay vì lượt chạy.",
  response: "Chuẩn ui-kpi-v2, P95 đo trong trình duyệt: từ lúc bấm thao tác chính đến khi hệ thống xác nhận đã nhận việc (tạo job, sự kiện đầu tiên hoặc kết quả đầu tiên). Không phải thời gian hoàn thành job. Nếu người dùng đã chuyển tab, mẫu chốt tại lúc hệ thống nhận việc. App chưa theo chuẩn hiển thị màu xám, không chấm.",
  click: "Chuẩn ui-kpi-v2, P95 đo trong trình duyệt: từ lúc bấm đến khi giao diện đã vẽ trạng thái đang xử lý. App chưa theo chuẩn hiển thị màu xám, không chấm.",
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

// One style for the summary's Thời gian hoàn thành and Tỷ lệ thành công, for every tool:
// green when the value meets its target, red when it does not, white without a value.
function summaryTone(value, target, kind) {
  if (value == null || target == null) return "muted"
  return (kind === "max" ? value <= target : value >= target) ? "good" : "bad"
}
const summaryTarget = (text, has, qualifier) => (has ? "Mục tiêu: " + text + (qualifier ? " · " + qualifier : "") : "Chưa có mục tiêu")

// Browser KPIs: coloured against the target only when the app follows ui-kpi-v2.
function KpiCell({ kpi, minSamples }) {
  const value = kpi.p95Ms == null ? "—" : (kpi.precision === "bucket" ? "≤ " : "") + compactTime(kpi.p95Ms)
  const note = kpi.p95Ms == null ? null : !kpi.standard ? "Chưa theo chuẩn đo ui-kpi-v2"
    : kpi.samples < minSamples ? kpi.samples + "/" + minSamples + " mẫu" : null
  return <MetricCell value={value} tone={kpi.standard ? summaryTone(kpi.p95Ms, kpi.targetMs, "max") : "dim"}
    target={"Mục tiêu: ≤ " + compactTime(kpi.targetMs)} note={note}
    title={[kpi.samples ? "P95 · " + kpi.samples + " mẫu" + (kpi.precision === "bucket" ? " · cận trên nhóm histogram" : "") : "App chưa đo", kpi.measures].filter(Boolean).join("\n")} />
}

function MetricCell({ value, tone, target, note, title }) {
  return (
    <>
      <strong className={"tool-metric " + tone} title={title}>{value}</strong>
      {target && <small>{target}</small>}
      {note && <small className="tool-dim">{note}</small>}
    </>
  )
}

function RunHistory({ tool }) {
  const [stepsRun, setStepsRun] = useState(null)
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
                    const groups = groupSteps(r.steps)
                    const chipTitle = (g) => [stepHint(g.job, g.estimated),
                      g.count > 1 ? g.count + " lần chạy: " + g.runs.map((x) => x.status === "failed" ? "lỗi" : compactTime(x.durationMs)).join(", ") : null].filter(Boolean).join(" · ")
                    return (
                      <div className="tool-steps-cell">
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
                        {groups.some((g) => g.count > 1) && (
                          <button type="button" className="tool-steps-toggle" aria-haspopup="dialog" onClick={() => setStepsRun(r)}>
                            Xem {r.steps.length} lần chạy theo thứ tự <ChevronRight size={13} aria-hidden="true" />
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
      {stepsRun && (
        <Drawer title={"Thứ tự " + stepsRun.steps.length + " lần chạy sub-job"} className="tool-steps-drawer" onClose={() => setStepsRun(null)}>
          <div className="tool-steps-drawer-meta">
            <b title={stepsRun.workload}>{stepsRun.workload || "—"}</b>
            <span className="tool-dim">{clockDate(stepsRun.endedAt ?? stepsRun.startedAt)} · {stepsRun.group ? "Tổng các bước " : "Thời lượng "}<b className="tool-metric inline">{compactTime(stepsRun.durationMs)}</b></span>
          </div>
          <ol className="tool-steps tool-steps-ordered">
            {stepsRun.steps.map((s, k) => (
              <li key={k} className={s.estimated ? "estimated" : s.status === "failed" ? "failed" : over(s.job, s.durationMs) ? "slow" : ""}>
                <span className="tool-step-index">{k + 1}</span>
                <span><b>{s.job}</b><Hint text={stepHint(s.job, s.estimated)} />{s.estimated && <small className="tool-dim"> · ước tính</small>}
                  {s.startedAt != null && <small className="tool-dim tool-step-clock">{clockDate(s.startedAt).slice(0, 8)}</small>}</span>
                <span>{s.status === "failed" ? "Lỗi" : s.status === "running" ? "Đang chạy" : (s.estimated ? "~" : "") + compactTime(s.durationMs)}</span>
              </li>
            ))}
          </ol>
        </Drawer>
      )}
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

function ToolDetail({ tool, onOpenReport }) {
  return (
    <div className="tool-detail">
      <div className="tool-detail-head">
        <h4><Layers size={15} aria-hidden="true" />Lịch sử các lần chạy <span className="tool-count">{tool.runs.length}</span></h4>
        <code className="tool-id" title={sourceLabels[tool.source] || ""}>Tool ID: {tool.id}</code>
      </div>
      <RunHistory tool={tool} />
      {tool.connected && tool.appStatus && <button type="button" className="text-button tool-report-link" onClick={() => onOpenReport(tool.id)}>Xem báo cáo kỹ thuật của app →</button>}
    </div>
  )
}

const clockTime = (at) => new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(at))

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
                  const timeTarget = t.timeTarget
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
                              <code>{(t.success.runs ?? 0) + " runs"}{deploys?.items ? " · " + deploys.items.length + " deploys" : ""}{t.owner ? " · " + t.owner : ""}</code>
                            </span>
                          </button>
                        </th>
                        <td>
                          <OpPill op={op} />
                          <small className="tool-dim">{t.reportedAt ? timeAgo(t.reportedAt) : t.reason || ""}</small>
                          {results.get(t.id)?.stale && <small className="tool-stale" title="Lần đọc mới nhất không thành công (app đang khởi động lại, chậm hoặc mất kết nối). Lab đang hiện số liệu đọc được gần nhất và sẽ tự đọc lại.">App chưa phản hồi · số liệu lúc {clockTime(results.get(t.id).stale.since)}</small>}
                          {t.connected && <small className={"tool-target-result " + toneOf(t.status)}>Mục tiêu: {statusLabels[t.status]}</small>}
                        </td>
                        <td>
                          {(() => {
                            // Headline: P95 of the Main Job in the window (same rule for every tool);
                            // the latest finished workload is in the tooltip.
                            const l = t.latest
                            const tone = summaryTone(u ? u.p95Ms : null, timeTarget == null ? null : timeTarget * 60000, "max")
                            return (
                              <MetricCell value={u ? compactTime(u.p95Ms) : "—"} tone={tone}
                                title={[u ? "P95 " + (t.widened ? t.windowDays + " ngày gần nhất" : "trong kỳ") + " · " + u.samples + " mẫu" : t.reason,
                                  l ? "Hoàn thành gần nhất: " + compactTime(l.durationMs) + " · " + (l.workload || "—") + " · " + timeAgo(new Date(l.at).toISOString()) : null].filter(Boolean).join("\n")}
                                target={summaryTarget("≤ " + minutesText(timeTarget), timeTarget != null, t.timeTargetProvisional ? "tạm tính" : null)}
                                note={u ? (t.widened ? t.windowDays + " ngày gần nhất · " : "") + u.samples + (u.samples < t.minSamples ? "/" + t.minSamples : "") + " mẫu" : null} />
                            )
                          })()}
                          {t.jobs.length > 0 && <SubJobMenu tool={t} label={t.hasMain && subCount ? subCount + " sub-jobs" : t.jobs.length + " jobs"} onOpenRuns={() => setOpen({ id: t.id, tab: "runs" })} />}
                        </td>
                        <td>
                          {/* Same style for every tool (Writer Studio's): coloured and "OK" by the rate against its
                              target; a small sample is noted in the tooltip instead of greying the value. */}
                          <MetricCell value={t.success.rate == null ? "—" : formatPercent(t.success.rate)}
                            tone={summaryTone(t.success.rate, t.success.target, "min")}
                            title={t.success.executed != null && t.success.executed < t.minSamples ? "Mới có " + t.success.executed + (t.success.unit === "items" ? " đơn vị" : " lượt chạy") + " (cần ≥ " + t.minSamples + " để chấm chính thức)" : undefined}
                            target={summaryTarget("≥ " + formatPercent(t.success.target), t.success.target != null, t.success.targetDefault ? "mặc định" : null)}
                            note={t.success.executed ? (t.success.unit === "items"
                              ? t.success.succeeded + "/" + t.success.executed + " đơn vị được xác nhận · " + t.success.runs + " lượt chạy"
                              : "Đo trên " + t.success.executed + " lượt chạy") + (t.widened ? " · " + t.windowDays + " ngày" : "") : null} />
                        </td>
                        <td>
                          <KpiCell kpi={t.response} minSamples={t.minSamples} />
                        </td>
                        <td>
                          <KpiCell kpi={t.click} minSamples={t.minSamples} />
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
                          <td colSpan={7}><ToolDetail tool={t} onOpenReport={onOpenReport} /></td>
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
