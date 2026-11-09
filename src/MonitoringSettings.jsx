import React, { useEffect, useState } from "react"
import { useNoticedState } from "./NoticeContext.jsx"
import { SettingsHeader, SettingsRow } from "./SettingsUI.jsx"
import { formatTime } from "./ToolOverview.jsx"

// One flow: connect a tool (address + token) → Lab reads its real report and detects the Main Job,
// sub-jobs and targets → save. Admins may adjust the detected profile; adjusted values are kept
// when Lab re-detects.
const probeLabels = {
  ready: "Kết nối được",
  degraded: "Kết nối được · app không báo database sẵn sàng",
  unauthorized: "Token không đúng với LAB_MONITORING_TOKEN của app",
  "not-found": "App chưa có endpoint /internal/monitoring hoặc chưa đặt LAB_MONITORING_TOKEN",
  invalid: "Phản hồi không đúng giao thức app-monitoring-v1",
  unavailable: "Không kết nối được (sai địa chỉ, timeout, redirect hoặc lỗi máy chủ)",
}
const targetSourceLabels = {
  app: "App khai báo",
  builtin: "Mặc định của Lab",
  baseline: "Baseline từ lịch sử",
  manual: "Admin điều chỉnh",
}
const detectedFromLabels = { runs: "từng lần chạy", history: "lịch sử job đã lưu", report: "số liệu app gửi" }
const emptyConnect = { name: "", owner: "", origin: "", token: "" }
const num = (v) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(",", ".")))
const minutesText = (m) => (m == null ? "—" : formatTime(m * 60000))
const dateText = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")

function targetSourceText(job) {
  if (!job.targetSource) return job.baselineSamples ? "Chưa đủ mẫu để đặt baseline (" + job.baselineSamples + " lần chạy)" : "Chưa có dữ liệu"
  if (job.targetSource === "baseline") return "Baseline P95 " + formatTime(job.baselineP95Ms) + " · " + job.baselineSamples + " lần chạy"
  return targetSourceLabels[job.targetSource]
}

function ProfileSummary({ tool }) {
  if (!tool) return <p className="settings-hint">Chưa nhận diện. Lab nhận diện khi tool có nguồn dữ liệu.</p>
  const main = tool.jobs.find((j) => j.role === "main")
  return (
    <div className="monitoring-profile">
      <dl>
        <div><dt>Main Job</dt><dd>{tool.mainJob || "—"}{main && main.name !== tool.mainJob ? " (job " + main.name + ")" : ""}{!main && tool.jobs.length > 1 ? " · chưa có job tổng; chấm theo tất cả job" : ""}</dd></div>
        <div><dt>Target error rate</dt><dd>{tool.errorRateTarget == null ? "Chưa có (cần ≥ " + tool.minSamples + " lần chạy)" : "≤ " + tool.errorRateTarget.toLocaleString("vi-VN") + "% · " + (tool.errorRateTargetSource === "manual" ? "Admin điều chỉnh" : "Baseline từ lịch sử")}</dd></div>
        <div><dt>Số mẫu tối thiểu</dt><dd>{tool.minSamples} lần chạy</dd></div>
      </dl>
      {tool.jobs.length ? (
        <div className="perf-table-scroll">
          <table className="monitoring-jobs">
            <thead><tr><th scope="col">Job</th><th scope="col">Target P95</th><th scope="col">Nguồn target</th></tr></thead>
            <tbody>
              {tool.jobs.map((j) => (
                <tr key={j.name}>
                  <th scope="row">
                    {j.role === "main" && <span className="monitoring-tag">MAIN</span>}{j.name}
                    {j.workloads?.length > 0 && <small>Workload: {j.workloads.join(", ")}</small>}
                  </th>
                  <td>{minutesText(j.targetMinutes)}</td>
                  <td>{targetSourceText(j)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="settings-hint">App chưa báo job nào. Tool hiện "No data" cho đến lần chạy đầu tiên.</p>}
      {tool.detectedAt && <p className="settings-hint">Nhận diện lúc {dateText(tool.detectedAt)} từ {detectedFromLabels[tool.detectedFrom] || "báo cáo của app"}. Lab tự cập nhật mỗi ngày; giá trị admin điều chỉnh được giữ nguyên.</p>}
    </div>
  )
}

// Optional overrides of the detected profile. Each changed value becomes "manual".
function ProfileEditor({ target, busy, onSave, onReset, onCancel }) {
  const tool = target.tool
  const [form, setForm] = useState(() => ({
    owner: tool.owner || "",
    errorRateTarget: tool.errorRateTarget ?? "",
    minSamples: String(tool.minSamples ?? 20),
    jobs: tool.jobs.map((j) => {
      const seconds = j.targetMinutes != null && j.targetMinutes < 2
      return { ...j, unit: seconds ? "s" : "m",
        value: j.targetMinutes == null ? "" : String(+(seconds ? j.targetMinutes * 60 : j.targetMinutes).toFixed(3)) }
    }),
  }))
  const setJob = (i, patch) =>
    setForm((f) => ({ ...f, jobs: f.jobs.map((j, k) => (k === i ? { ...j, ...patch } : patch.role === "main" ? { ...j, role: "sub" } : j)) }))
  function save() {
    const jobs = form.jobs.map(({ unit, value, ...j }, i) => {
      const old = tool.jobs[i], n = num(value)
      const targetMinutes = n == null ? null : unit === "s" ? n / 60 : n
      const targetChanged = Math.abs((targetMinutes ?? -1) - (old.targetMinutes ?? -1)) > 1e-9
      return { ...j, targetMinutes, targetSource: targetChanged ? "manual" : old.targetSource,
        roleSource: j.role !== old.role ? "manual" : old.roleSource }
    })
    // Choosing another Main Job manually also pins the role of the job that lost it.
    if (jobs.some((j, i) => j.role !== tool.jobs[i].role)) for (const j of jobs) j.roleSource = "manual"
    const errorRateTarget = num(form.errorRateTarget)
    onSave({
      ...tool, owner: form.owner, minSamples: num(form.minSamples) ?? 20, jobs, errorRateTarget,
      errorRateTargetSource: errorRateTarget !== tool.errorRateTarget ? (errorRateTarget == null ? null : "manual") : tool.errorRateTargetSource,
    })
  }
  return (
    <div className="monitoring-editor">
      <div className="settings-list">
        <SettingsRow title="Owner"><input aria-label="Owner" maxLength={100} value={form.owner} placeholder="Team phụ trách" onChange={(e) => setForm({ ...form, owner: e.target.value })} /></SettingsRow>
        <SettingsRow title="Target error rate (%)" description="Tính cả lỗi kỹ thuật và thất bại nghiệp vụ. Để trống để Lab dùng baseline.">
          <input aria-label="Target error rate" className="settings-number" inputMode="decimal" value={form.errorRateTarget} placeholder="—" onChange={(e) => setForm({ ...form, errorRateTarget: e.target.value })} />
        </SettingsRow>
        <SettingsRow title="Số mẫu tối thiểu" description="Số lần chạy trong kỳ trước khi chấm P95. Tool chạy ít có thể hạ xuống.">
          <input aria-label="Số mẫu tối thiểu" className="settings-number" inputMode="numeric" value={form.minSamples} onChange={(e) => setForm({ ...form, minSamples: e.target.value })} />
        </SettingsRow>
        {form.jobs.map((j, i) => (
          <SettingsRow key={j.name} title={j.name} description={targetSourceText(tool.jobs[i])}>
            <div className="settings-inline">
              <select aria-label={"Vai trò " + j.name} value={j.role} onChange={(e) => setJob(i, { role: e.target.value })}>
                <option value="main">Main Job</option>
                <option value="sub">Sub-job</option>
              </select>
              <input aria-label={"Target " + j.name} className="settings-number" inputMode="decimal" value={j.value} placeholder="—" onChange={(e) => setJob(i, { value: e.target.value })} />
              <select aria-label={"Đơn vị target " + j.name} value={j.unit} onChange={(e) => setJob(i, { unit: e.target.value })}>
                <option value="s">giây</option>
                <option value="m">phút</option>
              </select>
            </div>
          </SettingsRow>
        ))}
      </div>
      <div className="settings-actions">
        <button type="button" className="button primary" disabled={busy} onClick={save}>Lưu điều chỉnh</button>
        <button type="button" className="button" disabled={busy || !target.connected} onClick={onReset}>Khôi phục tự động</button>
        <button type="button" className="button" disabled={busy} onClick={onCancel}>Đóng</button>
      </div>
    </div>
  )
}

export default function MonitoringSettings({ api }) {
  const [data, setData] = useState(null),
    [form, setForm] = useState(emptyConnect),
    [editing, setEditing] = useState(null),
    [probe, setProbe] = useState(null),
    [adjusting, setAdjusting] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useNoticedState("", "error"),
    [notice, setNotice] = useNoticedState("", "success")
  useEffect(() => {
    api("/settings/monitoring").then(setData).catch((e) => setError(e.message))
  }, [])

  async function run(task, message) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await task()
      if (message) setNotice(message)
      return result
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const send = (path, method, body) => api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
  const editingTarget = data?.targets.find((t) => t.id === editing)
  const reset = () => {
    setForm(emptyConnect)
    setEditing(null)
    setProbe(null)
  }
  async function test(target = null) {
    const body = target ? { id: target.id } : { ...(editing ? { id: editing } : {}), origin: form.origin, ...(form.token ? { token: form.token } : {}) }
    const result = await run(() => send("/settings/monitoring/test", "POST", body))
    if (result) setProbe({ ...result, target: target?.id || editing || "new" })
  }
  async function save(e) {
    e.preventDefault()
    const connected = Boolean(form.origin)
    const appId = probe?.target === (editing || "new") && probe.appId ? probe.appId : editingTarget?.origin === form.origin ? editingTarget.appId : ""
    if (connected && !appId) return setError("Bấm Kiểm tra & nhận diện trước khi lưu, để Lab đọc appId và dữ liệu thật của tool.")
    const old = editingTarget?.tool
    const body = {
      name: form.name, origin: form.origin, appId: connected ? appId : "", ...(form.token ? { token: form.token } : {}),
      // A tool without a source keeps only what a person knows: its owner.
      tool: { ...(old || {}), owner: form.owner, ...(old ? {} : { jobs: [] }) },
    }
    const result = await run(
      () => (editing ? send("/settings/monitoring/" + encodeURIComponent(editing), "PUT", body) : send("/settings/monitoring", "POST", body)),
      connected ? "Đã lưu. Lab đã nhận diện job và target từ dữ liệu thật; xem trong Performance → Projects." : "Đã lưu tool chưa kết nối. Tool hiện No data cho đến khi có nguồn dữ liệu.",
    )
    if (result) {
      setData(result)
      reset()
    }
  }
  async function detect(id) {
    const result = await run(() => send("/settings/monitoring/" + encodeURIComponent(id) + "/detect", "POST"), "Đã nhận diện lại từ dữ liệu mới nhất.")
    if (result) setData(result)
  }
  async function saveProfile(target, tool) {
    const body = { name: target.name, origin: target.origin || "", appId: target.appId || "", tool }
    const result = await run(() => send("/settings/monitoring/" + encodeURIComponent(target.id), "PUT", body), "Đã lưu điều chỉnh. Các giá trị bạn đặt được giữ khi Lab nhận diện lại.")
    if (result) {
      setData(result)
      setAdjusting(null)
    }
  }
  async function resetProfile(target) {
    const tool = { ...target.tool, mainJobSource: "auto", errorRateTargetSource: null,
      jobs: target.tool.jobs.map((j) => ({ ...j, roleSource: "auto", targetSource: j.targetSource === "manual" ? null : j.targetSource })) }
    const saved = await run(() => send("/settings/monitoring/" + encodeURIComponent(target.id), "PUT", { name: target.name, origin: target.origin, appId: target.appId, tool }))
    if (saved) {
      setAdjusting(null)
      await detect(target.id)
    }
  }
  async function remove(id) {
    const result = await run(() => send("/settings/monitoring/" + encodeURIComponent(id), "DELETE"), "Đã xóa tool khỏi monitoring.")
    if (result) {
      setData(result)
      setConfirmDelete(null)
      if (editing === id) reset()
    }
  }
  const startEdit = (t) => {
    setEditing(t.id)
    setForm({ name: t.name, owner: t.tool?.owner || "", origin: t.origin || "", token: "" })
    setProbe(null)
    setAdjusting(null)
  }
  const full = data && data.targets.length >= data.max
  const ProbeResult = ({ result }) => {
    const ok = ["ready", "degraded"].includes(result.status)
    return (
      <div className={"monitoring-probe" + (ok ? "" : " error")} role="status">
        <strong>{probeLabels[result.status] || result.status}</strong>
        {result.httpStatus ? " · HTTP " + result.httpStatus : ""}
        {result.appId && <> · appId <code>{result.appId}</code></>}
        {result.fetchMs != null && " · " + result.fetchMs + " ms"}
        {ok && (
          <>
            <p className="settings-hint">
              {result.hasRuns ? "App gửi từng lần chạy: Lab tự tính theo giờ VN, so sánh kỳ trước và timeout." : "App gửi số liệu tổng hợp theo job. Thêm phần jobRuns để có so sánh kỳ trước và timeout."}
            </p>
            <h3>Lab nhận diện được</h3>
            <ProfileSummary tool={result.detected} />
          </>
        )}
      </div>
    )
  }

  return (
    <section className="settings-page">
      <SettingsHeader title="Monitoring ứng dụng">
        Kết nối tool vào Performance. Chỉ cần địa chỉ và token: Lab đọc dữ liệu thật của tool để tự nhận diện Main Job, sub-job và target, rồi cập nhật mỗi ngày. Lab chỉ đọc báo cáo, không chạy code hay deploy.
      </SettingsHeader>

      <section className="settings-group">
        <h2>Tool đang theo dõi{data ? " · " + data.targets.length + "/" + data.max : ""}</h2>
        {!data && !error && <p className="settings-hint">Đang tải…</p>}
        {data?.environmentError && <p className="settings-alert error">LAB_MONITORING_TARGETS trên Railway không hợp lệ nên đang bị bỏ qua.</p>}
        {data && !data.targets.length && <p className="settings-hint">Chưa có tool nào. Kết nối tool đầu tiên ở bên dưới.</p>}
        {data?.targets.map((t) => (
          <article className="settings-list monitoring-tool" key={t.id}>
            <SettingsRow
              title={
                <>
                  {t.name}
                  {t.source === "environment" && <span className="settings-badge">Biến môi trường</span>}
                  {!t.connected && <span className="settings-badge warning">Chưa kết nối nguồn dữ liệu</span>}
                  {!t.tokenReadable && <span className="settings-badge warning">Cần nhập lại token</span>}
                </>
              }
              description={[t.connected ? t.origin : null, t.tool?.owner ? "Owner: " + t.tool.owner : null].filter(Boolean).join(" · ")}
            >
              <div className="settings-inline">
                {t.connected && <button type="button" className="button" disabled={busy || !t.tokenReadable} onClick={() => test(t)}>Kiểm tra</button>}
                {t.source === "settings" && t.connected && <button type="button" className="button" disabled={busy} onClick={() => detect(t.id)}>Nhận diện lại</button>}
                {t.source === "settings" && (
                  <>
                    <button type="button" className="button" disabled={busy} onClick={() => startEdit(t)}>Sửa kết nối</button>
                    {confirmDelete === t.id ? (
                      <>
                        <button type="button" className="button danger" disabled={busy} onClick={() => remove(t.id)}>Xác nhận xóa</button>
                        <button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(null)}>Hủy</button>
                      </>
                    ) : <button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(t.id)}>Xóa</button>}
                  </>
                )}
              </div>
            </SettingsRow>
            <div className="monitoring-tool-body">
              {probe?.target === t.id ? <ProbeResult result={probe} /> : <ProfileSummary tool={t.tool} />}
              {t.source === "settings" && t.tool && (adjusting === t.id ? (
                <ProfileEditor target={t} busy={busy} onSave={(tool) => saveProfile(t, tool)} onReset={() => resetProfile(t)} onCancel={() => setAdjusting(null)} />
              ) : (
                <button type="button" className="text-button" disabled={busy} onClick={() => setAdjusting(t.id)}>Điều chỉnh job & target (không bắt buộc)</button>
              ))}
            </div>
          </article>
        ))}
      </section>

      <form className="settings-form" onSubmit={save}>
        <section className="settings-group">
          <h2>{editing ? "Sửa kết nối · " + editingTarget?.name : "Kết nối tool mới"}</h2>
          {full && !editing && <p className="settings-hint settings-warning">Đã đạt tối đa {data.max} tool. Xóa bớt trước khi thêm mới.</p>}
          <ol className="monitoring-steps">
            <li>Nhập tên, địa chỉ và token monitoring của tool.</li>
            <li>Bấm <b>Kiểm tra & nhận diện</b>: Lab đọc dữ liệu thật và đề xuất Main Job, sub-job, target.</li>
            <li>Bấm <b>Lưu</b>. Tool xuất hiện ngay trong Performance → Projects.</li>
          </ol>
          <div className="settings-list">
            <SettingsRow title="Tên tool">
              <input aria-label="Tên tool" required minLength={2} maxLength={100} value={form.name} placeholder="CV Screening" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="Owner" description="Không bắt buộc.">
              <input aria-label="Owner" maxLength={100} value={form.owner} placeholder="HR" onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="Địa chỉ tool" description="HTTPS công khai, chỉ domain. Để trống nếu tool chưa có nguồn dữ liệu (hiện No data).">
              <input aria-label="Địa chỉ tool" type="url" value={form.origin} placeholder="https://app.up.railway.app" autoComplete="off" onChange={(e) => { setForm({ ...form, origin: e.target.value }); setProbe(null) }} />
            </SettingsRow>
            {form.origin && (
              <SettingsRow title="Token monitoring" description={editing && editingTarget?.origin === form.origin ? "Để trống để giữ token đã lưu." : "Giá trị LAB_MONITORING_TOKEN của tool, tối thiểu 32 ký tự. Được mã hóa, không hiển thị lại."}>
                <input aria-label="Token monitoring" type="password" minLength={32} value={form.token} placeholder={editing ? "••••••••" : "Nhập token"} autoComplete="new-password" onChange={(e) => { setForm({ ...form, token: e.target.value }); setProbe(null) }} />
              </SettingsRow>
            )}
          </div>
          {probe && probe.target === (editing || "new") && <ProbeResult result={probe} />}
        </section>
        <div className="settings-footer">
          <span>{form.origin ? "Lab chỉ lưu sau khi kiểm tra được dữ liệu thật." : "Chưa có địa chỉ: tool được lưu ở trạng thái chưa kết nối."}</span>
          <div>
            {form.origin && (
              <button type="button" className="button" disabled={busy || (!(editing && editingTarget?.origin === form.origin) && form.token.length < 32)} onClick={() => test()}>
                Kiểm tra & nhận diện
              </button>
            )}
            {(editing || form.name || form.origin || form.token) && <button type="button" className="button" disabled={busy} onClick={reset}>{editing ? "Hủy sửa" : "Xóa nội dung"}</button>}
            <button className="button primary" disabled={busy || (full && !editing) || (form.origin && !(probe && ["ready", "degraded"].includes(probe.status) && probe.target === (editing || "new")) && !(editing && editingTarget?.origin === form.origin && !form.token))}>
              {editing ? "Lưu thay đổi" : "Lưu tool"}
            </button>
          </div>
        </div>
      </form>
      {error && <p role="alert" className="settings-alert error">{error}</p>}
      {notice && <p role="status" className="settings-alert">{notice}</p>}
      <details className="settings-extra">
        <summary>Tool cần chuẩn bị gì để kết nối</summary>
        <ol>
          <li>Có endpoint <code>GET /internal/monitoring?days=1..30</code> trả JSON giao thức <code>app-monitoring-v1</code> (404 khi chưa đặt token, 401 khi sai token).</li>
          <li>Đặt một chuỗi ngẫu nhiên ≥ 32 ký tự làm <code>LAB_MONITORING_TOKEN</code> trên service của tool, rồi deploy lại.</li>
          <li>Để Lab tự nhận diện đầy đủ, báo cáo nên có <code>jobRuns</code> (từng lần chạy: job, workload, job cha, trạng thái, bắt đầu, kết thúc) hoặc <code>jobHistory.completion</code>. Chi tiết trong docs/app-monitoring.md.</li>
        </ol>
      </details>
    </section>
  )
}
