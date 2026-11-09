import React, { useEffect, useState } from "react"
import { SettingsHeader, SettingsRow } from "./SettingsUI.jsx"
import { ConnectToolForm, ToolSettings, ProbeResult } from "./ToolManager.jsx"

// Settings page: list of tools and their connection state. Daily work (connect, adjust, remove)
// also happens in Performance → Status through the same panels.
export default function MonitoringSettings({ api }) {
  const [data, setData] = useState(null),
    [open, setOpen] = useState(null),
    [adding, setAdding] = useState(false),
    [probe, setProbe] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("")
  const load = () => api("/settings/monitoring").then(setData).catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])
  async function test(t) {
    setBusy(true)
    setError("")
    try {
      setProbe({ ...(await api("/settings/monitoring/test", { method: "POST", body: JSON.stringify({ id: t.id }) })), target: t.id })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const full = data && data.targets.length >= data.max

  return (
    <section className="settings-page">
      <SettingsHeader title="Monitoring ứng dụng">
        Kết nối tool vào Performance → Status. Chỉ cần địa chỉ và token: Lab đọc dữ liệu thật để tự nhận diện Main Job, sub-job và target, rồi cập nhật mỗi ngày. Lab chỉ đọc báo cáo, không chạy code hay deploy.
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
                  {t.railway && <span className="settings-badge">Railway</span>}
                </>
              }
              description={[
                t.tool?.description || t.tool?.mainJob,
                t.connected ? t.origin : null,
                t.tool?.jobs?.length ? t.tool.jobs.length + " job đã nhận diện" : t.connected ? "Chưa nhận diện" : null,
              ].filter(Boolean).join(" · ")}
            >
              <div className="settings-inline">
                {t.connected && <button type="button" className="button" disabled={busy || !t.tokenReadable} onClick={() => test(t)}>Kiểm tra</button>}
                <button type="button" className="button" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? "Đóng" : "Cài đặt"}</button>
              </div>
            </SettingsRow>
            {probe?.target === t.id && <div className="monitoring-tool-body"><ProbeResult result={probe} /></div>}
            {open === t.id && (
              <div className="monitoring-tool-body">
                <ToolSettings api={api} target={t} onChanged={(list) => setData(list)} onClose={() => setOpen(null)} />
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="settings-group">
        <h2>Kết nối tool mới</h2>
        {adding ? (
          <ConnectToolForm api={api} full={full} onCancel={() => setAdding(false)}
            onSaved={(list, message) => { setData(list); setAdding(false); setNotice(message) }} />
        ) : <button type="button" className="button primary" disabled={full} onClick={() => { setAdding(true); setNotice("") }}>+ Kết nối tool</button>}
      </section>
      {error && <p role="alert" className="settings-alert error">{error}</p>}
      {notice && <p role="status" className="settings-alert">{notice}</p>}
      <details className="settings-extra">
        <summary>Tool cần chuẩn bị gì để kết nối</summary>
        <ol>
          <li>Có endpoint <code>GET /internal/monitoring?days=1..30</code> trả JSON giao thức <code>app-monitoring-v1</code> (404 khi chưa đặt token, 401 khi sai token).</li>
          <li>Đặt một chuỗi ngẫu nhiên ≥ 32 ký tự làm <code>LAB_MONITORING_TOKEN</code> trên service của tool, rồi deploy lại.</li>
          <li>Để có lịch sử từng lần chạy và chi tiết sub-job, báo cáo gửi <code>jobRuns</code> (job, runId, parentRunId, workload, trạng thái, bắt đầu, kết thúc). Chi tiết trong docs/app-monitoring.md.</li>
          <li>Muốn xem sự kiện deploy: trong Cài đặt của tool, liên kết Railway service và một Project Access Token chỉ đọc.</li>
        </ol>
      </details>
    </section>
  )
}
