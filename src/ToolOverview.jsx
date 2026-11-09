import React, { useState } from "react"
import { ChevronDown, ChevronRight, CircleHelp, Plus, Settings2, Trash2, Layers } from "lucide-react"
import { evaluateTool, priorities, statusLabels, statusOrder, summarize } from "../server/tool-performance.js"
import { formatTime, formatPercent, timeAgo, dateTime } from "./tool-format.js"
import { ConnectToolForm, Drawer, ToolSettings } from "./ToolManager.jsx"
import "./tool-overview.css"

export { formatTime }

const minutesText = (m) => (m == null ? null : formatTime(m * 60000))
const sourceLabels = {
  runs: "Tính từ từng lần chạy, theo giờ VN",
  history: "Từ lịch sử job app đã lưu (kỳ theo ngày UTC)",
  instrumented: "Từ số liệu đo trực tiếp của app (kỳ theo ngày UTC)",
}
const hints = {
  tool: "Tool và Main Job: công việc trọn vẹn mà người dùng nhận được kết quả. Lab tự nhận diện từ dữ liệu thật.",
  status: "Trạng thái vận hành: Lab đọc được báo cáo của tool hay không, và lần báo cáo gần nhất. Viền màu đầu dòng là kết quả so với target.",
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
  return <small className={d > 0 ? "tool-worse" : "tool-better"}>So với kỳ trước: {d > 0 ? "+" : "−"}{formatTime(Math.abs(d))}</small>
}

function RunHistory({ tool }) {
  if (!tool.runs.length)
    return <p className="tool-note">{tool.source === "runs" ? "Chưa có lần chạy nào trong 61 ngày gần đây." : "App chưa gửi từng lần chạy (jobRuns), nên chưa có lịch sử."}</p>
  const targets = new Map(tool.jobs.map((j) => [j.name, j.targetMinutes]))
  const over = (job, ms) => targets.get(job) && ms > targets.get(job) * 60000
  return (
    <div className="perf-table-scroll">
      <table className="tool-runs">
        <thead>
          <tr><th scope="col">Thời gian</th><th scope="col">Workload / Tài liệu</th><th scope="col">Thời lượng</th><th scope="col">Chi tiết từng sub-job</th><th scope="col">Trạng thái</th></tr>
        </thead>
        <tbody>
          {tool.runs.map((r, i) => (
            <tr key={(r.runId || "") + i}>
              <td>{dateTime(r.endedAt ?? r.startedAt)}<small className="tool-dim">{timeAgo(new Date(r.endedAt ?? r.startedAt).toISOString())}{r.job && tool.jobs.length > 1 && !r.steps.length ? " · " + r.job : ""}</small></td>
              <td className="tool-workload" title={r.workload}>{r.workload || "—"}</td>
              <td>
                <span className={!r.group && over(r.job, r.durationMs) ? "tool-metric bad" : "tool-metric good"}>{formatTime(r.durationMs)}</span>
                {r.group && <small className="tool-dim">Tổng thời gian các bước</small>}
              </td>
              <td>
                {r.steps.length ? (
                  <ul className="tool-steps">
                    {r.steps.map((s, k) => (
                      <li key={k} className={s.status === "failed" ? "failed" : over(s.job, s.durationMs) ? "slow" : ""}>
                        <span>{s.job}{s.workload && s.workload !== r.workload ? <small className="tool-dim"> · {s.workload}</small> : null}</span>
                        <span>{s.status === "failed" ? "Lỗi" : s.status === "running" ? "Đang chạy" : formatTime(s.durationMs)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <span className="tool-dim">—</span>}
              </td>
              <td><span className={"tool-run-status " + r.status}>{r.status === "success" ? "Thành công" : r.status === "failed" ? "Thất bại" : "Đang chạy"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubJobs({ tool }) {
  if (!tool.jobs.length)
    return <p className="tool-note">{tool.source ? "Không có lần chạy nào kết thúc trong kỳ này." : "App chưa gửi số liệu thời gian theo job (jobRuns hoặc jobHistory.completion)."}</p>
  return (
    <div className="perf-table-scroll">
      <table className="tool-jobs">
        <thead><tr><th scope="col">Job</th><th scope="col">P95 / target</th><th scope="col">Mẫu</th><th scope="col">Thành công</th><th scope="col">Trạng thái</th></tr></thead>
        <tbody>
          {tool.jobs.map((j) => {
            const name = <>{j.role === "main" && <span className="tool-tag">MAIN JOB</span>}{j.name}</>
            if (j.unmeasured)
              return (
                <tr key={j.name} className="tool-unmeasured">
                  <th scope="row">{name}<small>{j.role === "main" || j.baselineSamples > 0 || tool.source === "runs" ? "Không có lần chạy nào kết thúc trong kỳ này." : "Chưa có điểm đo riêng; đang tính chung trong Main Job."}</small></th>
                  <td>— / {minutesText(j.targetMinutes) || "Chưa có target"}</td><td>—</td><td>—</td><td>—</td>
                </tr>
              )
            return j.units.map((u, i) => (
              <tr key={j.name + i}>
                <th scope="row">{name}{u.workload && <small>Workload: {u.workload}</small>}</th>
                <td>
                  <span className={"tool-metric " + toneOf(u.status)}>{formatTime(u.p95Ms)}</span> <span className="tool-dim">/ {minutesText(u.targetMinutes) || "Chưa có target"}</span>
                  {u.medianMs != null && <small className="tool-dim">Trung vị {formatTime(u.medianMs)} · chậm nhất {formatTime(u.maxMs)}</small>}
                  {u.overRuns > 0 && <small className="tool-worse">{u.overRuns} lần vượt target</small>}
                  <Trend unit={u} />
                </td>
                <td>{u.samples}</td>
                <td>{i === 0 && j.error?.executed ? formatPercent(100 - j.error.rate) + " · " + (j.error.executed - j.error.failed) + "/" + j.error.executed : i === 0 ? "—" : ""}</td>
                <td><span className={"tool-badge " + u.status}>{statusLabels[u.status]}</span></td>
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
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
              <td>{dateTime(Date.parse(d.createdAt))}<small className="tool-dim">{timeAgo(d.createdAt)}</small></td>
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
  const [tab, setTab] = useState(initialTab)
  const tabs = [
    ["runs", "Lịch sử các lần chạy gần đây (" + tool.runs.length + ")"],
    ["jobs", "Sub-job (" + tool.jobs.length + ")"],
    ["deploys", "Sự kiện deploy" + (deploys?.items ? " (" + deploys.items.length + ")" : "")],
  ]
  return (
    <div className="tool-detail">
      <div className="tool-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
        <span className="tool-dim">{sourceLabels[tool.source] || ""}</span>
      </div>
      {tab === "runs" && <RunHistory tool={tool} />}
      {tab === "jobs" && <SubJobs tool={tool} />}
      {tab === "deploys" && <Deploys deploys={deploys} linked={tool.railwayLinked} />}
      {tool.connected && tool.appStatus && <button type="button" className="button" onClick={() => onOpenReport(tool.id)}>Xem báo cáo kỹ thuật của app</button>}
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
                ? formatTime(p.p95Ms) + " / target " + minutesText(p.targetMinutes) + " · " + p.samples + " mẫu" + (p.overRuns ? " · " + p.overRuns + " lần vượt" : "")
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
  const [filter, setFilter] = useState(null),
    [open, setOpen] = useState(null),
    [drawer, setDrawer] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const results = new Map((data.targets || []).map((t) => [t.id, t]))
  const listed = data.tools || data.targets.map((t) => ({ id: t.id, name: t.name, connected: true, tool: null }))
  const tools = listed
    .map((t) => ({ ...evaluateTool({ ...t, result: results.get(t.id), days }), listed: t, railwayLinked: Boolean(t.railway) }))
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name))
  const counts = summarize(tools)
  const todo = priorities(tools)
  const decisions = data.priorities || []
  const shown = tools.filter((t) => !filter || t.status === filter)
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
        <div className="tool-chips" role="group" aria-label="Lọc theo kết quả so với target">
          {["bad", "insufficient", "ok", "notarget", "nodata"].map((s) => (
            <button key={s} type="button" className={"tool-chip " + s} aria-pressed={filter === s} onClick={() => setFilter(filter === s ? null : s)}>
              <b>{counts[s]}</b> {statusLabels[s]}
            </button>
          ))}
        </div>
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
                {shown.map((t) => {
                  const op = operational(t), u = t.headline, deploys = data.deploys?.[t.id]
                  const timeTarget = u?.targetMinutes || t.mainTargetMinutes
                  const subCount = t.jobs.filter((j) => j.role !== "main").length
                  return (
                    <React.Fragment key={t.id}>
                      <tr className={"tool-row result-" + t.status + (open?.id === t.id ? " selected" : "")}>
                        <th scope="row">
                          <button type="button" className="tool-name" aria-expanded={open?.id === t.id} onClick={() => setOpen(open?.id === t.id ? null : { id: t.id, tab: "runs" })}>
                            {open?.id === t.id ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                            <span>
                              <b>{t.name}</b>
                              <small>{t.description || t.mainJob || (t.jobCount > 1 ? "Chưa có job tổng · chấm theo " + t.jobCount + " job" : "Chưa có dữ liệu để nhận diện")}</small>
                              <code>{(t.success.executed ?? 0) + " lượt"}{deploys?.items ? " · " + deploys.items.length + " deploy" : ""}{t.owner ? " · " + t.owner : ""}</code>
                            </span>
                          </button>
                        </th>
                        <td>
                          <span className={"tool-op " + op.tone}>{op.label}</span>
                          <small className="tool-dim">{t.reportedAt ? timeAgo(t.reportedAt) : t.reason || ""}</small>
                          <small className={"tool-result " + t.status}>{statusLabels[t.status]}</small>
                        </td>
                        <td>
                          <MetricCell value={u ? formatTime(u.p95Ms) : "—"} tone={toneOf(u?.status)}
                            target={timeTarget ? "Mục tiêu: ≤ " + minutesText(timeTarget) : "Chưa có mục tiêu"}
                            note={u ? u.samples + " mẫu" + (u.samples < t.minSamples ? " (cần ≥ " + t.minSamples + ")" : "") + (!t.hasMain && t.jobCount > 1 ? " · " + u.job : "") : t.reason} />
                          <Trend unit={u} />
                          {t.jobs.length > 0 && (
                            <button type="button" className="tool-subjobs" onClick={() => setOpen({ id: t.id, tab: "jobs" })}>
                              <Layers size={13} aria-hidden="true" /> {t.hasMain && subCount ? subCount + " sub-job" : t.jobs.length + " job"} <ChevronDown size={12} aria-hidden="true" />
                            </button>
                          )}
                        </td>
                        <td>
                          <MetricCell value={t.success.rate == null ? "—" : formatPercent(t.success.rate) + (t.success.status === "ok" ? " OK" : "")} tone={toneOf(t.success.status)}
                            target={t.success.target == null ? "Chưa có mục tiêu" : "Mục tiêu: ≥ " + formatPercent(t.success.target)}
                            note={t.success.executed ? "Đo trên " + t.success.executed + " lượt chạy" + (t.success.timedOut ? " · " + t.success.timedOut + " quá thời gian chờ" : "") : null} />
                        </td>
                        <td>
                          <MetricCell value={formatTime(t.response.p95Ms)} tone={toneOf(t.response.status)} target={"Mục tiêu: ≤ " + formatTime(t.response.targetMs)}
                            note={t.response.samples ? t.response.samples + " mẫu" : "App chưa đo"} />
                        </td>
                        <td>
                          <MetricCell value={formatTime(t.click.p95Ms)} tone={toneOf(t.click.status)} target={"Mục tiêu: ≤ " + formatTime(t.click.targetMs)}
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
                {tools.length > 0 && !shown.length && <tr><td colSpan={7} className="perf-empty">Không có tool nào ở trạng thái này.</td></tr>}
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
