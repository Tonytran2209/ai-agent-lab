import React, { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { evaluateTool, priorities, statusLabels, statusOrder, summarize } from "../server/tool-performance.js"
import "./tool-overview.css"

const nf = (v, digits = 1) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(v)
// Seconds below two minutes, otherwise minutes and seconds (the BA prototype convention).
export function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—"
  const s = Math.round(ms / 1000)
  if (s < 120) return nf(ms / 1000) + " giây"
  return Math.floor(s / 60) + " phút" + (s % 60 ? " " + (s % 60) + " giây" : "")
}
const minutesText = (m) => (m == null ? null : formatTime(m * 60000))
const percent = (v) => (v == null ? "—" : nf(v, 2) + "%")

function Badge({ status }) {
  return <span className={"tool-badge " + status}>{statusLabels[status]}</span>
}

function TimeCell({ unit, minSamples, jobName = null }) {
  if (!unit || unit.p95Ms == null) return <><span className="tool-dim">—</span><small>{unit?.targetMinutes ? "target " + minutesText(unit.targetMinutes) : "Chưa có target"}</small></>
  const over = unit.targetMinutes && unit.p95Ms > unit.targetMinutes * 60000
  return (
    <>
      <span className={over ? "tool-over" : ""}>{formatTime(unit.p95Ms)}</span>
      {jobName && <small>Job chậm nhất so với target: {jobName}</small>}
      <small>
        {unit.targetMinutes ? "target " + minutesText(unit.targetMinutes) : "Chưa có target"} · {unit.samples} mẫu
        {unit.samples < minSamples ? " (cần ≥ " + minSamples + ")" : ""}
        {unit.workload ? " · " + unit.workload : ""}
      </small>
      {unit.samples < minSamples && unit.medianMs != null && <small>Trung vị {formatTime(unit.medianMs)} · chậm nhất {formatTime(unit.maxMs)}</small>}
      <Trend unit={unit} />
    </>
  )
}

function ErrorCell({ error, minSamples }) {
  if (error.rate == null) return <><span className="tool-dim">—</span><small>{error.target != null ? "target ≤ " + percent(error.target) : "Chưa có target"}</small></>
  const over = error.target != null && error.rate > error.target
  return (
    <>
      <span className={over ? "tool-over" : ""}>{percent(error.rate)}</span>
      <small>
        {error.target != null ? "target ≤ " + percent(error.target) : "Chưa có target"} · {error.failed}/{error.executed} lần lỗi
        {error.executed < minSamples ? " (cần ≥ " + minSamples + " lần chạy)" : ""}
      </small>
      {error.timedOut > 0 && <small>{error.timedOut} lần quá thời gian chờ, tính là lỗi</small>}
    </>
  )
}

function JobDetail({ tool }) {
  if (!tool.jobs.length)
    return (
      <p className="tool-note">
        {tool.connected ? "App chưa gửi số liệu thời gian theo job (performanceKpis.jobCompletion). " : ""}
        Lab sẽ tự nhận diện job khi app gửi số liệu theo job.
      </p>
    )
  return (
    <div className="perf-table-scroll">
      <table className="tool-jobs">
        <thead>
          <tr><th scope="col">Job</th><th scope="col">P95 / target</th><th scope="col">Mẫu</th><th scope="col">Lỗi</th><th scope="col">Trạng thái</th></tr>
        </thead>
        <tbody>
          {tool.jobs.map((j) => {
            const meta = (
              <>
                {(j.startEvent || j.endEvent) && <small>Đo từ: {j.startEvent || "?"} → {j.endEvent || "?"}</small>}
                {j.successCondition && <small>Thành công khi: {j.successCondition}</small>}
              </>
            )
            const name = (
              <>
                {j.role === "main" && <span className="tool-tag">MAIN JOB</span>}
                {j.name}
                {j.perItem && <span className="tool-dim"> (mỗi item)</span>}
              </>
            )
            if (j.unmeasured)
              return (
                <tr key={j.name} className="tool-unmeasured">
                  <th scope="row">{name}<small>Chưa có điểm đo riêng; đang tính chung trong Main Job.</small>{meta}</th>
                  <td>— / {minutesText(j.targetMinutes) || "Chưa có target"}</td><td>—</td><td>—</td><td>—</td>
                </tr>
              )
            return j.units.map((u, i) => (
              <tr key={j.name + i} className={j.role === "main" ? "tool-main" : ""}>
                <th scope="row">{name}{u.workload && <small>Workload: {u.workload}</small>}{i === 0 && meta}</th>
                <td>
                  <span className={u.status === "bad" ? "tool-over" : ""}>{formatTime(u.p95Ms)}</span> <span className="tool-dim">/ {minutesText(u.targetMinutes) || "Chưa có target"}</span>
                  {u.medianMs != null && <small>Trung vị {formatTime(u.medianMs)} · chậm nhất {formatTime(u.maxMs)}</small>}
                  {u.overRuns > 0 && <small>{u.overRuns} lần vượt target</small>}
                  <Trend unit={u} />
                </td>
                <td>{u.samples}</td>
                <td>{i === 0 && j.error ? <span className={j.error.status === "bad" ? "tool-over" : ""}>{j.error.failed}/{j.error.executed}</span> : i === 0 ? "—" : ""}</td>
                <td><Badge status={u.status} /></td>
              </tr>
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}

const sourceLabels = { runs: "Tính từ từng lần chạy, theo giờ VN", history: "Từ lịch sử job app đã lưu (kỳ theo ngày UTC)", instrumented: "Từ số liệu đo trực tiếp của app (kỳ theo ngày UTC)" }

function Trend({ unit }) {
  if (unit?.previousP95Ms == null || unit.p95Ms == null) return null
  const d = unit.p95Ms - unit.previousP95Ms
  if (Math.abs(d) < 500) return <small>So với kỳ trước: không đổi</small>
  return <small className={d > 0 ? "tool-worse" : "tool-better"}>So với kỳ trước: {d > 0 ? "+" : "−"}{formatTime(Math.abs(d))}</small>
}

export default function ToolOverview({ data, days = 7, onOpenReport }) {
  const [filter, setFilter] = useState(null),
    [open, setOpen] = useState(null)
  const results = new Map((data.targets || []).map((t) => [t.id, t]))
  const declared = data.tools || data.targets.map((t) => ({ id: t.id, name: t.name, connected: true, tool: null }))
  const tools = declared
    .map((t) => evaluateTool({ ...t, result: results.get(t.id), days }))
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name))
  if (!tools.length) return null
  const counts = summarize(tools)
  const todo = priorities(tools)
  const shown = tools.filter((t) => !filter || t.status === filter)

  return (
    <section className="tool-overview" aria-labelledby="tool-overview-title">
      <div className="tool-summary">
        <div className="tool-hero">
          <strong>{counts.bad}<span> / {tools.length} tool</span></strong>
          <span>Chưa đạt target</span>
        </div>
        <div className="tool-hero">
          <strong>{todo.time.length + todo.errors.length}</strong>
          <span>Điểm cần tối ưu</span>
        </div>
        <div className="tool-chips" role="group" aria-label="Lọc theo trạng thái">
          {["bad", "insufficient", "ok", "notarget", "nodata"].map((s) => (
            <button key={s} type="button" className={"tool-chip " + s} aria-pressed={filter === s} onClick={() => setFilter(filter === s ? null : s)}>
              <b>{counts[s]}</b> {statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      <article className="perf-card">
        <div className="perf-card-heading">
          <div>
            <h3 id="tool-overview-title">Tool theo Main Job</h3>
            <p>P95 thời gian và tỷ lệ lỗi (lỗi kỹ thuật + thất bại nghiệp vụ) so với target khai báo trong Lab. Bấm một tool để xem từng job.</p>
          </div>
        </div>
        <div className="perf-table-scroll">
          <table className="tool-table">
            <thead>
              <tr><th scope="col">Tool · Main Job</th><th scope="col">Thời gian (P95)</th><th scope="col">Error rate</th><th scope="col">Trạng thái</th></tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <React.Fragment key={t.id}>
                  <tr className={open === t.id ? "selected" : ""}>
                    <th scope="row">
                      <button type="button" className="tool-name" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
                        {open === t.id ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                        <span>
                          <b>{t.name}</b>
                          <small>
                            {t.mainJob || (t.jobCount > 1 ? "Chưa có job tổng · chấm theo " + t.jobCount + " job" : t.connected ? "Chưa có job nào được báo cáo" : "Chưa có dữ liệu để nhận diện")}
                            {t.owner ? " · " + t.owner : ""}
                          </small>
                        </span>
                      </button>
                    </th>
                    <td><TimeCell unit={t.headline} minSamples={t.minSamples} jobName={!t.hasMain && t.jobCount > 1 ? t.headline?.job : null} /></td>
                    <td><ErrorCell error={t.error} minSamples={t.minSamples} /></td>
                    <td>
                      <Badge status={t.status} />
                      {t.reason && <small>{t.reason}</small>}
                    </td>
                  </tr>
                  {open === t.id && (
                    <tr className="tool-detail-row">
                      <td colSpan={4}>
                        <div className="tool-detail">
                          <p className="tool-note">
                            {sourceLabels[t.source] ? sourceLabels[t.source] + ". " : ""}
                            Số mẫu tối thiểu để chấm: {t.minSamples} lần chạy trong kỳ.
                            {t.driver?.factor ? " Yếu tố ảnh hưởng thời gian: " + t.driver.factor + (t.driver.unit ? " (" + t.driver.unit + ")" : "") + "." : ""}
                            {t.error.unverified ? " " + t.error.unverified + " lần hoàn thành chưa đủ bằng chứng kết quả (không tính là lỗi)." : ""}
                          </p>
                          <JobDetail tool={t} />
                          {t.connected && results.get(t.id) && (
                            <button type="button" className="button" onClick={() => onOpenReport(t.id)}>Xem báo cáo kỹ thuật của app</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!shown.length && <tr><td colSpan={4} className="perf-empty">Không có tool nào ở trạng thái này.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <div className="tool-priority-grid">
        <article className="perf-card">
          <h3>Chậm hơn target</h3>
          <p className="tool-note">Xếp theo % vượt target.</p>
          {todo.time.length ? (
            <ol className="tool-priority">
              {todo.time.map((p, i) => (
                <li key={p.toolId + p.job + i}>
                  <span><b>{p.job}</b> · {p.tool}{p.workload ? " · " + p.workload : ""}</span>
                  <span className="tool-over">+{nf(p.overPercent, 0)}%</span>
                  <small>{formatTime(p.p95Ms)} / target {minutesText(p.targetMinutes)} · {p.samples} mẫu</small>
                </li>
              ))}
            </ol>
          ) : <p className="tool-dim">Không có job nào chậm hơn target.</p>}
        </article>
        <article className="perf-card">
          <h3>Lỗi / thất bại vượt target</h3>
          <p className="tool-note">Xếp theo số lần lỗi. Không gộp với thời gian vì hai loại không so sánh trực tiếp được.</p>
          {todo.errors.length ? (
            <ol className="tool-priority">
              {todo.errors.map((p) => (
                <li key={p.toolId}>
                  <span><b>{p.job || "Main Job"}</b> · {p.tool}</span>
                  <span className="tool-over">{p.failed} lỗi</span>
                  <small>{percent(p.rate)} / target ≤ {percent(p.target)} · {p.executed} lần chạy</small>
                </li>
              ))}
            </ol>
          ) : <p className="tool-dim">Không có tool nào vượt target lỗi.</p>}
        </article>
      </div>
    </section>
  )
}
