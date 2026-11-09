import React, { useEffect, useState } from "react"
import { useNoticedState } from "./NoticeContext.jsx"
import { SettingsHeader, SettingsRow } from "./SettingsUI.jsx"

const probeLabels = {
  ready: "Kết nối được · app và database phản hồi",
  degraded: "Kết nối được · database chưa sẵn sàng hoặc app không báo trạng thái database",
  unauthorized: "Token không đúng với LAB_MONITORING_TOKEN của app",
  "not-found": "App chưa có endpoint /internal/monitoring hoặc chưa đặt LAB_MONITORING_TOKEN",
  invalid: "Phản hồi không đúng giao thức app-monitoring-v1",
  unavailable: "Không kết nối được (sai địa chỉ, timeout, redirect hoặc lỗi máy chủ)",
}
const sectionLabels = {
  profile: "Thông tin riêng của app",
  jobHistory: "Lịch sử job theo kỳ",
  jobHistoryAllTime: "Toàn bộ lịch sử job",
  performanceKpis: "Response time / click latency",
  http: "HTTP",
  ai: "AI usage",
  runtime: "Tiến trình máy chủ",
  database: "Database",
  inventory: "Trạng thái hàng đợi",
  contentWorkload: "Khối lượng nội dung",
}
const emptyJob = { name: "", role: "sub", startEvent: "", endEvent: "", successCondition: "", targetValue: "", targetUnit: "m", perItem: false }
const emptyTool = { owner: "", mainJob: "", factor: "", unit: "", errorRateTarget: "", minSamples: "20", jobs: [{ ...emptyJob, role: "main" }] }
const empty = { name: "", origin: "", appId: "", token: "", tool: emptyTool }
const num = (v) => (String(v).trim() === "" ? null : Number(String(v).replace(",", ".")))
// Form state <-> tool-config-v1. Targets are typed in seconds or minutes and stored in minutes.
function toolBody(t) {
  return {
    owner: t.owner, mainJob: t.mainJob, driver: { factor: t.factor, unit: t.unit },
    errorRateTarget: num(t.errorRateTarget), minSamples: num(t.minSamples) ?? 20,
    jobs: t.jobs.filter((j) => j.name.trim()).map(({ targetValue, targetUnit, ...j }) => {
      const value = num(targetValue)
      return { ...j, name: j.name.trim(), targetMinutes: value == null ? null : targetUnit === "s" ? value / 60 : value }
    }),
  }
}
function toolForm(tool) {
  if (!tool) return { ...emptyTool, jobs: [] }
  return {
    owner: tool.owner || "", mainJob: tool.mainJob || "", factor: tool.driver?.factor || "", unit: tool.driver?.unit || "",
    errorRateTarget: tool.errorRateTarget ?? "", minSamples: String(tool.minSamples ?? 20),
    jobs: (tool.jobs || []).map((j) => {
      const seconds = j.targetMinutes != null && j.targetMinutes < 2
      return { ...emptyJob, ...j, targetUnit: seconds ? "s" : "m",
        targetValue: j.targetMinutes == null ? "" : String(+(seconds ? j.targetMinutes * 60 : j.targetMinutes).toFixed(3)) }
    }),
  }
}

export default function MonitoringSettings({ api }) {
  const [data, setData] = useState(null),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState(null),
    [probe, setProbe] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useNoticedState("", "error"),
    [notice, setNotice] = useNoticedState("", "success")
  const load = () => api("/settings/monitoring").then(setData).catch((e) => setError(e.message))
  useEffect(() => {
    load()
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
  const reset = () => {
    setForm(empty)
    setEditing(null)
    setProbe(null)
  }
  async function test(target = null) {
    const body = target
      ? { id: target.id }
      : { ...(editing ? { id: editing } : {}), origin: form.origin, ...(form.token ? { token: form.token } : {}) }
    const result = await run(() => api("/settings/monitoring/test", { method: "POST", body: JSON.stringify(body) }))
    if (!result) return
    setProbe({ ...result, target: target?.id || editing || "new" })
    if (!target && result.appId && !form.appId) setForm((f) => ({ ...f, appId: result.appId }))
  }
  async function save(e) {
    e.preventDefault()
    const body = { name: form.name, origin: form.origin, appId: form.appId, ...(form.token ? { token: form.token } : {}), tool: toolBody(form.tool) }
    const result = await run(
      () =>
        api(editing ? "/settings/monitoring/" + encodeURIComponent(editing) : "/settings/monitoring", {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(body),
        }),
      editing ? "Đã lưu thay đổi. Dashboard Performance dùng cấu hình mới ngay." : "Đã thêm tool. Tool xuất hiện trong Performance → Projects (No data cho đến lần chạy đầu tiên).",
    )
    if (result) {
      setData(result)
      reset()
    }
  }
  async function remove(id) {
    const result = await run(() => api("/settings/monitoring/" + encodeURIComponent(id), { method: "DELETE" }), "Đã xóa ứng dụng khỏi monitoring.")
    if (result) {
      setData(result)
      setConfirmDelete(null)
      if (editing === id) reset()
    }
  }
  const startEdit = (t) => {
    setEditing(t.id)
    setForm({ name: t.name, origin: t.origin || "", appId: t.appId || "", token: "", tool: toolForm(t.tool) })
    setProbe(null)
  }
  const setTool = (patch) => setForm((f) => ({ ...f, tool: { ...f.tool, ...patch } }))
  const setJob = (index, patch) =>
    setForm((f) => ({
      ...f,
      tool: {
        ...f.tool,
        // Only one Main Job: choosing a new one turns the previous one into a sub-job.
        jobs: f.tool.jobs.map((j, i) => (i === index ? { ...j, ...patch } : patch.role === "main" ? { ...j, role: "sub" } : j)),
      },
    }))
  const jobSuggestions = probe?.jobs || []
  const full = data && data.targets.length >= data.max
  const ProbeResult = ({ result }) => (
    <div className={"settings-alert" + (["ready", "degraded"].includes(result.status) ? "" : " error")} role="status">
      <strong>{probeLabels[result.status] || result.status}</strong>
      {result.httpStatus ? " · HTTP " + result.httpStatus : ""}
      {result.appId && <> · appId <code>{result.appId}</code></>}
      {result.fetchMs != null && " · " + result.fetchMs + " ms"}
      {result.profileTitle && <div>Main job: {result.profileTitle}</div>}
      {result.sections.length > 0 && <div>Dashboard sẽ hiển thị: {result.sections.map((s) => sectionLabels[s] || s).join(", ")}.</div>}
    </div>
  )

  return (
    <section className="settings-page">
      <SettingsHeader title="Monitoring ứng dụng">
        Khai báo tool, Main Job, các job cần đo và target. Tool xuất hiện ngay trong Performance → Projects; số liệu bắt đầu khi có nguồn dữ liệu kết nối. Lab chỉ đọc báo cáo, không cấp quyền chạy code hay deploy.
      </SettingsHeader>
      <section className="settings-group">
        <h2>Tool đang theo dõi{data ? " · " + data.targets.length + "/" + data.max : ""}</h2>
        {!data && !error && <p className="settings-hint">Đang tải…</p>}
        {data?.environmentError && (
          <p className="settings-alert error">LAB_MONITORING_TARGETS trên Railway không hợp lệ nên đang bị bỏ qua. Các ứng dụng thêm trong Cài đặt vẫn hoạt động.</p>
        )}
        {data && !data.targets.length && <p className="settings-hint">Chưa có tool nào. Thêm tool đầu tiên ở bên dưới.</p>}
        {data?.targets.length > 0 && (
          <div className="settings-list">
            {data.targets.map((t) => (
              <React.Fragment key={t.id}>
                <SettingsRow
                  title={
                    <>
                      {t.name} <span className="settings-badge">{t.source === "settings" ? "Cài đặt" : "Biến môi trường"}</span>
                      {!t.connected && <span className="settings-badge warning">Chưa kết nối nguồn dữ liệu</span>}
                      {!t.tokenReadable && <span className="settings-badge warning">Cần nhập lại token</span>}
                    </>
                  }
                  description={[
                    t.tool?.mainJob && "Main Job: " + t.tool.mainJob,
                    t.tool?.jobs?.length ? t.tool.jobs.length + " job đã khai báo" : "Chưa khai báo job/target",
                    t.connected ? t.origin + " · appId " + t.appId : null,
                  ].filter(Boolean).join(" · ")}
                >
                  <div className="settings-inline">
                    <button type="button" className="button" disabled={busy || !t.connected || !t.tokenReadable} onClick={() => test(t)}>Kiểm tra</button>
                    {t.source === "settings" && (
                      <>
                        <button type="button" className="button" disabled={busy} onClick={() => startEdit(t)}>Sửa</button>
                        {confirmDelete === t.id ? (
                          <>
                            <button type="button" className="button danger" disabled={busy} onClick={() => remove(t.id)}>Xác nhận xóa</button>
                            <button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(null)}>Hủy</button>
                          </>
                        ) : (
                          <button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(t.id)}>Xóa</button>
                        )}
                      </>
                    )}
                  </div>
                </SettingsRow>
                {probe?.target === t.id && <ProbeResult result={probe} />}
              </React.Fragment>
            ))}
          </div>
        )}
      </section>

      <form className="settings-form" onSubmit={save}>
        <section className="settings-group">
          <h2>{editing ? "Sửa tool" : "Thêm tool"} · 1. Thông tin tool</h2>
          {full && !editing && <p className="settings-hint settings-warning">Đã đạt tối đa {data.max} tool. Xóa bớt trước khi thêm mới.</p>}
          <div className="settings-list">
            <SettingsRow title="Tên tool">
              <input aria-label="Tên tool" required minLength={2} maxLength={100} value={form.name} placeholder="CV Screening" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="Owner">
              <input aria-label="Owner" maxLength={100} value={form.tool.owner} placeholder="HR" onChange={(e) => setTool({ owner: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="Main Job" description="Toàn bộ công việc mà người dùng nhận được kết quả, viết theo ngôn ngữ của người dùng.">
              <input aria-label="Main Job" maxLength={200} value={form.tool.mainJob} placeholder="Chấm điểm và đánh giá 1 CV theo barem" onChange={(e) => setTool({ mainJob: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="Yếu tố ảnh hưởng thời gian chạy" description="Không bắt buộc. Dùng để so các lần chạy cùng mức workload.">
              <div className="settings-inline">
                <input aria-label="Yếu tố" maxLength={100} value={form.tool.factor} placeholder="Số trang" onChange={(e) => setTool({ factor: e.target.value })} />
                <input aria-label="Đơn vị" className="settings-number" maxLength={40} value={form.tool.unit} placeholder="trang" onChange={(e) => setTool({ unit: e.target.value })} />
              </div>
            </SettingsRow>
          </div>
        </section>

        <section className="settings-group">
          <h2>2. Nguồn dữ liệu (không bắt buộc)</h2>
          <p className="settings-hint">Có thể lưu tool trước khi có nguồn dữ liệu; dashboard hiện "No data" cho đến lần chạy đầu tiên. Hiện hỗ trợ endpoint app-monitoring-v1.</p>
          <div className="settings-list">
            <SettingsRow title="Địa chỉ ứng dụng" description="HTTPS công khai, chỉ domain. Lab gọi <địa chỉ>/internal/monitoring.">
              <input aria-label="Địa chỉ ứng dụng" type="url" value={form.origin} placeholder="https://app.up.railway.app" autoComplete="off" onChange={(e) => setForm({ ...form, origin: e.target.value })} />
            </SettingsRow>
            <SettingsRow
              title="Token monitoring"
              description={editing ? "Để trống để giữ token đã lưu. Bắt buộc nếu đổi địa chỉ." : "Giá trị LAB_MONITORING_TOKEN của app, tối thiểu 32 ký tự. Được mã hóa trên server, không hiển thị lại."}
            >
              <input aria-label="Token monitoring" type="password" minLength={32} value={form.token} placeholder={editing ? "••••••••" : "Nhập token"} autoComplete="new-password" onChange={(e) => setForm({ ...form, token: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="App ID" description="Tự điền sau khi kiểm tra kết nối. Lab chỉ nhận báo cáo có đúng appId này.">
              <input aria-label="App ID" maxLength={64} required={Boolean(form.origin)} value={form.appId} placeholder="Kiểm tra kết nối để tự điền" autoComplete="off" onChange={(e) => setForm({ ...form, appId: e.target.value })} />
            </SettingsRow>
          </div>
          {probe && probe.target === (editing || "new") && <ProbeResult result={probe} />}
        </section>

        <section className="settings-group">
          <h2>3. Job & Sub-job</h2>
          <p className="settings-hint">
            Mỗi job cần điểm bắt đầu, điểm kết thúc và điều kiện thành công. Tên job phải trùng tên app báo cáo
            {jobSuggestions.length ? " (gợi ý từ lần kiểm tra kết nối)" : " (bấm Kiểm tra kết nối để xem gợi ý)"}. Target có thể để trống và cập nhật sau khi có baseline.
          </p>
          <datalist id="monitoring-job-names">
            {jobSuggestions.map((j) => <option key={j} value={j} />)}
          </datalist>
          {form.tool.jobs.map((job, index) => (
            <div className="settings-list monitoring-job" key={index}>
              <SettingsRow title={job.role === "main" ? "Main Job" : "Sub-job " + index}>
                <div className="settings-inline">
                  <input aria-label={"Tên job " + (index + 1)} list="monitoring-job-names" maxLength={100} value={job.name} placeholder="Tên job app báo cáo" onChange={(e) => setJob(index, { name: e.target.value })} />
                  <select aria-label={"Vai trò job " + (index + 1)} value={job.role} onChange={(e) => setJob(index, { role: e.target.value })}>
                    <option value="main">Main Job</option>
                    <option value="sub">Sub-job</option>
                  </select>
                </div>
              </SettingsRow>
              <SettingsRow title="Đo từ → đến">
                <div className="settings-inline">
                  <input aria-label={"Điểm bắt đầu job " + (index + 1)} maxLength={200} value={job.startEvent} placeholder="User bấm Generate" onChange={(e) => setJob(index, { startEvent: e.target.value })} />
                  <input aria-label={"Điểm kết thúc job " + (index + 1)} maxLength={200} value={job.endEvent} placeholder="Kết quả hiển thị" onChange={(e) => setJob(index, { endEvent: e.target.value })} />
                </div>
              </SettingsRow>
              <SettingsRow title="Thành công khi">
                <input aria-label={"Điều kiện thành công job " + (index + 1)} maxLength={200} value={job.successCondition} placeholder="Có đủ kết quả theo template" onChange={(e) => setJob(index, { successCondition: e.target.value })} />
              </SettingsRow>
              <SettingsRow title="Target thời gian (P95)">
                <div className="settings-inline">
                  <input aria-label={"Target job " + (index + 1)} className="settings-number" inputMode="decimal" value={job.targetValue} placeholder="—" onChange={(e) => setJob(index, { targetValue: e.target.value })} />
                  <select aria-label={"Đơn vị target job " + (index + 1)} value={job.targetUnit} onChange={(e) => setJob(index, { targetUnit: e.target.value })}>
                    <option value="s">giây</option>
                    <option value="m">phút</option>
                  </select>
                  <label className="settings-check">
                    <input type="checkbox" checked={job.perItem} onChange={(e) => setJob(index, { perItem: e.target.checked })} /> Tính theo từng item
                  </label>
                  <button type="button" className="button" onClick={() => setTool({ jobs: form.tool.jobs.filter((_, i) => i !== index) })}>Xóa job</button>
                </div>
              </SettingsRow>
            </div>
          ))}
          <button type="button" className="button" disabled={form.tool.jobs.length >= 20}
            onClick={() => setTool({ jobs: [...form.tool.jobs, { ...emptyJob, role: form.tool.jobs.some((j) => j.role === "main") ? "sub" : "main" }] })}>
            + Thêm {form.tool.jobs.some((j) => j.role === "main") ? "sub-job" : "Main Job"}
          </button>
        </section>

        <section className="settings-group">
          <h2>4. Tiêu chuẩn đo</h2>
          <div className="settings-list">
            <SettingsRow title="Target error rate (%)" description="Tính cả lỗi kỹ thuật và thất bại nghiệp vụ. Để trống nếu chưa có baseline.">
              <input aria-label="Target error rate" className="settings-number" inputMode="decimal" value={form.tool.errorRateTarget} placeholder="—" onChange={(e) => setTool({ errorRateTarget: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="Số mẫu tối thiểu" description="Số lần chạy trong kỳ cần có trước khi chấm Đạt/Chưa đạt theo P95. Mặc định 20; tool chạy ít có thể hạ xuống.">
              <input aria-label="Số mẫu tối thiểu" className="settings-number" inputMode="numeric" value={form.tool.minSamples} onChange={(e) => setTool({ minSamples: e.target.value })} />
            </SettingsRow>
          </div>
        </section>
        <div className="settings-footer">
          <span>{form.origin ? "Nên kiểm tra kết nối trước khi lưu." : "Chưa có nguồn dữ liệu: tool sẽ hiện No data."}</span>
          <div>
            <button type="button" className="button" disabled={busy || !form.origin || (!editing && form.token.length < 32)} onClick={() => test()}>Kiểm tra kết nối</button>
            {(editing || form.name || form.origin || form.token || form.tool.mainJob) && <button type="button" className="button" disabled={busy} onClick={reset}>{editing ? "Hủy sửa" : "Xóa nội dung"}</button>}
            <button className="button primary" disabled={busy || (full && !editing)}>{editing ? "Lưu thay đổi" : "Thêm tool"}</button>
          </div>
        </div>
      </form>
      {error && <p role="alert" className="settings-alert error">{error}</p>}
      {notice && <p role="status" className="settings-alert">{notice}</p>}
      <details className="settings-extra">
        <summary>Cách kết nối một ứng dụng</summary>
        <ol>
          <li>Thêm endpoint <code>GET /internal/monitoring?days=1..30</code> vào app, trả về JSON giao thức <code>app-monitoring-v1</code>. Endpoint trả 404 khi chưa đặt token và 401 khi sai token.</li>
          <li>Tạo một chuỗi ngẫu nhiên dài ít nhất 32 ký tự, đặt làm <code>LAB_MONITORING_TOKEN</code> trên service của app, rồi deploy lại app.</li>
          <li>Nhập địa chỉ và token ở đây, bấm Kiểm tra kết nối để Lab tự đọc appId và gợi ý tên job, khai báo job và target, rồi Thêm tool.</li>
          <li>Muốn hiển thị số liệu riêng (main job, phễu, bảng trạng thái, ngưỡng job), app gửi thêm phần <code>profile</code> theo docs/app-monitoring.md.</li>
        </ol>
      </details>
    </section>
  )
}
