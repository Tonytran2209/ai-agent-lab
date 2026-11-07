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
const empty = { name: "", origin: "", appId: "", token: "" }

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
    const body = { name: form.name, origin: form.origin, appId: form.appId, ...(form.token ? { token: form.token } : {}) }
    const result = await run(
      () =>
        api(editing ? "/settings/monitoring/" + encodeURIComponent(editing) : "/settings/monitoring", {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(body),
        }),
      editing ? "Đã lưu thay đổi. Dashboard Performance dùng cấu hình mới ngay." : "Đã thêm ứng dụng. Mở Performance → Projects để xem số liệu.",
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
    setForm({ name: t.name, origin: t.origin, appId: t.appId, token: "" })
    setProbe(null)
  }
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
        Thêm hoặc xóa ứng dụng hiển thị trong Performance → Projects. Lab chỉ đọc báo cáo số liệu từ endpoint monitoring của từng app; không cấp quyền chạy code hay deploy.
      </SettingsHeader>
      <section className="settings-group">
        <h2>Ứng dụng đang theo dõi{data ? " · " + data.targets.length + "/" + data.max : ""}</h2>
        {!data && !error && <p className="settings-hint">Đang tải…</p>}
        {data?.environmentError && (
          <p className="settings-alert error">LAB_MONITORING_TARGETS trên Railway không hợp lệ nên đang bị bỏ qua. Các ứng dụng thêm trong Cài đặt vẫn hoạt động.</p>
        )}
        {data && !data.targets.length && <p className="settings-hint">Chưa có ứng dụng nào. Thêm ứng dụng đầu tiên ở bên dưới.</p>}
        {data?.targets.length > 0 && (
          <div className="settings-list">
            {data.targets.map((t) => (
              <React.Fragment key={t.id}>
                <SettingsRow
                  title={
                    <>
                      {t.name} <span className="settings-badge">{t.source === "settings" ? "Cài đặt" : "Biến môi trường"}</span>
                      {!t.tokenReadable && <span className="settings-badge warning">Cần nhập lại token</span>}
                    </>
                  }
                  description={t.origin + " · appId " + t.appId}
                >
                  <div className="settings-inline">
                    <button type="button" className="button" disabled={busy || !t.tokenReadable} onClick={() => test(t)}>Kiểm tra</button>
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
          <h2>{editing ? "Sửa ứng dụng" : "Thêm ứng dụng"}</h2>
          {full && !editing && <p className="settings-hint settings-warning">Đã đạt tối đa {data.max} ứng dụng. Xóa bớt trước khi thêm mới.</p>}
          <div className="settings-list">
            <SettingsRow title="Tên hiển thị">
              <input aria-label="Tên ứng dụng" required minLength={2} maxLength={100} value={form.name} placeholder="Outreach" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="Địa chỉ ứng dụng" description="HTTPS công khai, chỉ domain. Lab gọi <địa chỉ>/internal/monitoring.">
              <input aria-label="Địa chỉ ứng dụng" required type="url" value={form.origin} placeholder="https://app.up.railway.app" autoComplete="off" onChange={(e) => setForm({ ...form, origin: e.target.value })} />
            </SettingsRow>
            <SettingsRow
              title="Token monitoring"
              description={editing ? "Để trống để giữ token đã lưu. Bắt buộc nếu đổi địa chỉ." : "Giá trị LAB_MONITORING_TOKEN của app, tối thiểu 32 ký tự. Được mã hóa trên server, không hiển thị lại."}
            >
              <input aria-label="Token monitoring" type="password" required={!editing} minLength={32} value={form.token} placeholder={editing ? "••••••••" : "Nhập token"} autoComplete="new-password" onChange={(e) => setForm({ ...form, token: e.target.value })} />
            </SettingsRow>
            <SettingsRow title="App ID" description="Tự điền sau khi kiểm tra kết nối. Lab chỉ nhận báo cáo có đúng appId này.">
              <input aria-label="App ID" required maxLength={64} value={form.appId} placeholder="Kiểm tra kết nối để tự điền" autoComplete="off" onChange={(e) => setForm({ ...form, appId: e.target.value })} />
            </SettingsRow>
          </div>
          {probe && probe.target === (editing || "new") && <ProbeResult result={probe} />}
        </section>
        <div className="settings-footer">
          <span>Nên kiểm tra kết nối trước khi lưu.</span>
          <div>
            <button type="button" className="button" disabled={busy || !form.origin || (!editing && form.token.length < 32)} onClick={() => test()}>Kiểm tra kết nối</button>
            {(editing || form.name || form.origin || form.token) && <button type="button" className="button" disabled={busy} onClick={reset}>{editing ? "Hủy sửa" : "Xóa nội dung"}</button>}
            <button className="button primary" disabled={busy || (full && !editing)}>{editing ? "Lưu thay đổi" : "Thêm ứng dụng"}</button>
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
          <li>Nhập địa chỉ và token ở đây, bấm Kiểm tra kết nối để Lab tự đọc appId, rồi Thêm ứng dụng.</li>
          <li>Muốn hiển thị số liệu riêng (main job, phễu, bảng trạng thái, ngưỡng job), app gửi thêm phần <code>profile</code> theo docs/app-monitoring.md.</li>
        </ol>
      </details>
    </section>
  )
}
