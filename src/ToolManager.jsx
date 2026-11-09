import React, { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { SettingsRow } from "./SettingsUI.jsx"
import { formatTime } from "./tool-format.js"

// Shared tool management for the Status tab and Settings: connect a tool (detection runs on the
// tool's real report), edit information, connection and job targets, and remove a tool.
export const probeLabels = {
  ready: "Kết nối được",
  degraded: "Kết nối được · app không báo database sẵn sàng",
  unauthorized: "Token không đúng với LAB_MONITORING_TOKEN của app",
  "not-found": "App chưa có endpoint /internal/monitoring hoặc chưa đặt LAB_MONITORING_TOKEN",
  invalid: "Phản hồi không đúng giao thức app-monitoring-v1",
  unavailable: "Không kết nối được (sai địa chỉ, timeout, redirect hoặc lỗi máy chủ)",
}
const targetSourceLabels = { app: "App khai báo", builtin: "Mặc định của Lab", baseline: "Baseline từ lịch sử", manual: "Admin điều chỉnh" }
const detectedFromLabels = { runs: "từng lần chạy", history: "lịch sử job đã lưu", report: "số liệu app gửi" }
const num = (v) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(",", ".")))
const minutesText = (m) => (m == null ? "—" : formatTime(m * 60000))
const pct = (v) => (v == null ? "—" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(v) + "%")
const dateText = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "")

export function targetSourceText(job) {
  if (!job.targetSource) return job.baselineSamples ? "Chưa đủ mẫu để đặt baseline (" + job.baselineSamples + " lần chạy)" : "Chưa có dữ liệu"
  if (job.targetSource === "baseline") return "Baseline P95 " + formatTime(job.baselineP95Ms) + " · " + job.baselineSamples + " lần chạy"
  return targetSourceLabels[job.targetSource]
}

async function request(api, path, method, body) {
  return api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}

// Run an async action with busy/error state shared by the panels.
function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("")
  async function run(task, message = "") {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await task()
      setNotice(message)
      return result
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, notice, run, setError }
}

function Messages({ error, notice }) {
  return (
    <>
      {error && <p role="alert" className="settings-alert error">{error}</p>}
      {notice && <p role="status" className="settings-alert">{notice}</p>}
    </>
  )
}

export function ProfileSummary({ tool, connected = true }) {
  if (!tool)
    return <p className="settings-hint">{connected ? "Chưa nhận diện. Lab tự nhận diện ở lần đọc báo cáo kế tiếp, hoặc bấm Nhận diện ngay." : "Chưa kết nối nguồn dữ liệu nên chưa có gì để nhận diện."}</p>
  const main = tool.jobs.find((j) => j.role === "main")
  return (
    <div className="monitoring-profile">
      <dl>
        <div><dt>Main Job</dt><dd>{tool.mainJob || "—"}{main && main.name !== tool.mainJob ? " (job " + main.name + ")" : ""}{!main && tool.jobs.length > 1 ? " · chưa có job tổng; chấm theo tất cả job" : ""}</dd></div>
        <div><dt>Mục tiêu tỷ lệ thành công</dt><dd>{tool.errorRateTarget == null ? "Chưa có (cần ≥ " + tool.minSamples + " lần chạy)" : "≥ " + pct(100 - tool.errorRateTarget) + " · " + (tool.errorRateTargetSource === "manual" ? "Admin điều chỉnh" : tool.errorRateTargetSource === "app" ? "App khai báo" : "Baseline từ lịch sử")}</dd></div>
        <div><dt>Tốc độ phản hồi · độ nhạy thao tác</dt><dd>≤ {formatTime(tool.responseTargetMs || 2500)} · ≤ {formatTime(tool.clickTargetMs || 200)}</dd></div>
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
                    {j.workloads?.length > 0 && <small>Workload: {j.workloads.slice(0, 3).join(", ")}{j.workloads.length > 3 ? "…" : ""}</small>}
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

export function ProbeResult({ result }) {
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
            {result.hasRuns ? "App gửi từng lần chạy: Lab tự tính theo giờ VN, so sánh kỳ trước và timeout." : "App gửi số liệu tổng hợp theo job. Thêm phần jobRuns để có lịch sử từng lần chạy."}
          </p>
          <h3>Lab nhận diện được</h3>
          <ProfileSummary tool={result.detected} />
        </>
      )}
    </div>
  )
}

// Connect a new tool: information, address and token → test & detect → save.
export function ConnectToolForm({ api, full = false, onSaved, onCancel }) {
  const [form, setForm] = useState({ name: "", description: "", owner: "", origin: "", token: "" }),
    [probe, setProbe] = useState(null)
  const { busy, error, notice, run, setError } = useAction()
  const tested = probe && ["ready", "degraded"].includes(probe.status)
  async function test() {
    const result = await run(() => request(api, "/settings/monitoring/test", "POST", { origin: form.origin, token: form.token }))
    if (result) setProbe(result)
  }
  async function save(e) {
    e.preventDefault()
    if (form.origin && !tested) return setError("Bấm Kiểm tra & nhận diện trước khi lưu, để Lab đọc appId và dữ liệu thật của tool.")
    const body = {
      name: form.name, origin: form.origin, appId: form.origin ? probe.appId : "", ...(form.token ? { token: form.token } : {}),
      tool: { owner: form.owner, description: form.description, jobs: [] },
    }
    const list = await run(() => request(api, "/settings/monitoring", "POST", body))
    if (list) onSaved?.(list, form.origin ? "Đã kết nối. Lab đã nhận diện job và target từ dữ liệu thật." : "Đã lưu tool chưa kết nối. Tool hiện No data.")
  }
  return (
    <form className="settings-form tool-connect" onSubmit={save}>
      <ol className="monitoring-steps">
        <li>Nhập tên, mô tả nghiệp vụ, địa chỉ và token monitoring của tool.</li>
        <li>Bấm <b>Kiểm tra & nhận diện</b>: Lab đọc dữ liệu thật và đề xuất Main Job, sub-job, target.</li>
        <li>Bấm <b>Lưu tool</b>. Tool xuất hiện ngay trong Performance → Status.</li>
      </ol>
      {full && <p className="settings-hint settings-warning">Đã đạt số tool tối đa. Xóa bớt trước khi thêm mới.</p>}
      <div className="settings-list">
        <SettingsRow title="Tên tool">
          <input aria-label="Tên tool" required minLength={2} maxLength={100} value={form.name} placeholder="Proposal / RFP Assistant" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </SettingsRow>
        <SettingsRow title="Mô tả nghiệp vụ" description="Main Job viết theo ngôn ngữ người dùng. Không bắt buộc; Lab dùng mô tả app gửi nếu có.">
          <input aria-label="Mô tả nghiệp vụ" maxLength={300} value={form.description} placeholder="Bóc tách gói thầu và lập báo cáo bid" onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </SettingsRow>
        <SettingsRow title="Owner" description="Không bắt buộc.">
          <input aria-label="Owner" maxLength={100} value={form.owner} placeholder="Account team" onChange={(e) => setForm({ ...form, owner: e.target.value })} />
        </SettingsRow>
        <SettingsRow title="Địa chỉ tool" description="HTTPS công khai, chỉ domain. Để trống nếu tool chưa có nguồn dữ liệu (hiện No data).">
          <input aria-label="Địa chỉ tool" type="url" value={form.origin} placeholder="https://app.up.railway.app" autoComplete="off" onChange={(e) => { setForm({ ...form, origin: e.target.value }); setProbe(null) }} />
        </SettingsRow>
        {form.origin && (
          <SettingsRow title="Token monitoring" description="Giá trị LAB_MONITORING_TOKEN của tool, tối thiểu 32 ký tự. Được mã hóa, không hiển thị lại.">
            <input aria-label="Token monitoring" type="password" minLength={32} value={form.token} placeholder="Nhập token" autoComplete="new-password" onChange={(e) => { setForm({ ...form, token: e.target.value }); setProbe(null) }} />
          </SettingsRow>
        )}
      </div>
      {probe && <ProbeResult result={probe} />}
      <div className="settings-footer">
        <span>{form.origin ? "Lab chỉ lưu sau khi kiểm tra được dữ liệu thật." : "Chưa có địa chỉ: tool được lưu ở trạng thái chưa kết nối."}</span>
        <div>
          {form.origin && <button type="button" className="button" disabled={busy || form.token.length < 32} onClick={test}>Kiểm tra & nhận diện</button>}
          {onCancel && <button type="button" className="button" disabled={busy} onClick={onCancel}>Hủy</button>}
          <button className="button primary" disabled={busy || full || (form.origin && !tested)}>Lưu tool</button>
        </div>
      </div>
      <Messages error={error} notice={notice} />
    </form>
  )
}

// Optional adjustments of the detected profile; changed values become "manual".
function ProfileEditor({ target, busy, onSave, onReset }) {
  const tool = target.tool
  const [form, setForm] = useState(() => ({
    successTarget: tool.errorRateTarget == null ? "" : String(+(100 - tool.errorRateTarget).toFixed(2)),
    responseTarget: String((tool.responseTargetMs || 2500) / 1000),
    clickTarget: String(tool.clickTargetMs || 200),
    minSamples: String(tool.minSamples ?? 20),
    jobs: tool.jobs.map((j) => {
      const seconds = j.targetMinutes != null && j.targetMinutes < 2
      return { ...j, unit: seconds ? "s" : "m", value: j.targetMinutes == null ? "" : String(+(seconds ? j.targetMinutes * 60 : j.targetMinutes).toFixed(3)) }
    }),
  }))
  const setJob = (i, patch) =>
    setForm((f) => ({ ...f, jobs: f.jobs.map((j, k) => (k === i ? { ...j, ...patch } : patch.role === "main" ? { ...j, role: "sub" } : j)) }))
  function save() {
    const jobs = form.jobs.map(({ unit, value, ...j }, i) => {
      const old = tool.jobs[i], n = num(value)
      const targetMinutes = n == null ? null : unit === "s" ? n / 60 : n
      const changed = Math.abs((targetMinutes ?? -1) - (old.targetMinutes ?? -1)) > 1e-9
      return { ...j, targetMinutes, targetSource: changed ? "manual" : old.targetSource, roleSource: j.role !== old.role ? "manual" : old.roleSource }
    })
    if (jobs.some((j, i) => j.role !== tool.jobs[i].role)) for (const j of jobs) j.roleSource = "manual"
    const success = num(form.successTarget)
    const errorRateTarget = success == null ? null : Math.max(0, Math.min(100, +(100 - success).toFixed(4)))
    const response = num(form.responseTarget), click = num(form.clickTarget)
    onSave({
      ...tool, jobs, minSamples: num(form.minSamples) ?? 20, errorRateTarget,
      errorRateTargetSource: errorRateTarget !== tool.errorRateTarget ? (errorRateTarget == null ? null : "manual") : tool.errorRateTargetSource,
      responseTargetMs: response == null || response * 1000 === 2500 ? null : response * 1000,
      clickTargetMs: click == null || click === 200 ? null : click,
    })
  }
  return (
    <div className="monitoring-editor">
      <div className="settings-list">
        <SettingsRow title="Mục tiêu tỷ lệ thành công (%)" description="Thành công = không lỗi kỹ thuật, không thất bại nghiệp vụ. Để trống để Lab dùng baseline.">
          <input aria-label="Mục tiêu tỷ lệ thành công" className="settings-number" inputMode="decimal" value={form.successTarget} placeholder="—" onChange={(e) => setForm({ ...form, successTarget: e.target.value })} />
        </SettingsRow>
        <SettingsRow title="Tốc độ phản hồi (giây)" description="P95 từ lúc gửi yêu cầu đến phản hồi có ý nghĩa đầu tiên. Mặc định 2,5 giây.">
          <input aria-label="Mục tiêu tốc độ phản hồi" className="settings-number" inputMode="decimal" value={form.responseTarget} onChange={(e) => setForm({ ...form, responseTarget: e.target.value })} />
        </SettingsRow>
        <SettingsRow title="Độ nhạy thao tác (ms)" description="P95 từ lúc bấm đến khi UI phản hồi. Mặc định 200 ms.">
          <input aria-label="Mục tiêu độ nhạy thao tác" className="settings-number" inputMode="numeric" value={form.clickTarget} onChange={(e) => setForm({ ...form, clickTarget: e.target.value })} />
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
        <button type="button" className="button primary" disabled={busy} onClick={save}>Lưu job & target</button>
        <button type="button" className="button" disabled={busy || !target.connected} onClick={onReset}>Khôi phục tự động</button>
      </div>
    </div>
  )
}

// Settings of one tool, in three parts: information, connection, jobs & targets; plus removal.
export function ToolSettings({ api, target, onChanged, onClose }) {
  const [info, setInfo] = useState({ name: target.name, description: target.tool?.description || "", owner: target.tool?.owner || "" }),
    [conn, setConn] = useState({ origin: target.origin || "", token: "", railwayUrl: target.railway?.url || "", railwayToken: "" }),
    [probe, setProbe] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(false)
  const { busy, error, notice, run } = useAction()
  const env = target.source === "environment"
  const path = "/settings/monitoring/" + encodeURIComponent(target.id)
  const changed = (list, message) => { onChanged?.(list); return message }
  const profileBase = target.tool || { jobs: [] }

  async function saveInfo() {
    let list = null
    if (!env && info.name !== target.name)
      list = await run(() => request(api, path, "PUT", { name: info.name, origin: target.origin || "", appId: target.appId || "" }))
    if (!env && info.name !== target.name && !list) return
    list = await run(() => request(api, path + "/profile", "PUT", { ...profileBase, description: info.description, owner: info.owner }), "Đã lưu thông tin.")
    if (list) changed(list)
  }
  async function test() {
    const body = conn.origin === target.origin && !conn.token ? { id: target.id } : { id: target.id, origin: conn.origin, ...(conn.token ? { token: conn.token } : {}) }
    const result = await run(() => request(api, "/settings/monitoring/test", "POST", body))
    if (result) setProbe(result)
  }
  async function saveConnection() {
    const appId = probe?.appId || (conn.origin === target.origin ? target.appId : "")
    if (conn.origin && !appId) return run(async () => { throw new Error("Bấm Kiểm tra trước khi lưu địa chỉ mới.") })
    const list = await run(() => request(api, path, "PUT", { name: target.name, origin: conn.origin, appId: conn.origin ? appId : "", ...(conn.token ? { token: conn.token } : {}) }), "Đã lưu kết nối.")
    if (list) changed(list)
  }
  async function saveRailway() {
    const body = conn.railwayUrl ? { url: conn.railwayUrl, ...(conn.railwayToken ? { token: conn.railwayToken } : {}) } : null
    const list = await run(() => request(api, path + "/railway", "PUT", body ?? { url: "" }), conn.railwayUrl ? "Đã liên kết Railway. Sự kiện deploy hiện trong Status." : "Đã bỏ liên kết Railway.")
    if (list) changed(list)
  }
  async function detect() {
    const list = await run(() => request(api, path + "/detect", "POST"), "Đã nhận diện lại từ dữ liệu mới nhất.")
    if (list) changed(list)
  }
  async function saveProfile(tool) {
    const list = await run(() => request(api, path + "/profile", "PUT", tool), "Đã lưu. Giá trị bạn đặt được giữ khi Lab nhận diện lại.")
    if (list) changed(list)
  }
  async function resetProfile() {
    const tool = { ...target.tool, mainJobSource: "auto", errorRateTargetSource: null,
      jobs: target.tool.jobs.map((j) => ({ ...j, roleSource: "auto", targetSource: j.targetSource === "manual" ? null : j.targetSource })) }
    if (await run(() => request(api, path + "/profile", "PUT", tool))) await detect()
  }
  async function remove() {
    const list = await run(() => request(api, path, "DELETE"), "Đã xóa tool.")
    if (list) { onChanged?.(list); onClose?.() }
  }

  return (
    <div className="tool-settings">
      <section className="settings-group">
        <h2>Thông tin</h2>
        <div className="settings-list">
          <SettingsRow title="Tên tool" description={env ? "Tool cấu hình bằng LAB_MONITORING_TARGETS; đổi tên trong Railway." : null}>
            <input aria-label="Tên tool" disabled={env} minLength={2} maxLength={100} value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
          </SettingsRow>
          <SettingsRow title="Mô tả nghiệp vụ">
            <input aria-label="Mô tả nghiệp vụ" maxLength={300} value={info.description} placeholder="Main Job theo ngôn ngữ người dùng" onChange={(e) => setInfo({ ...info, description: e.target.value })} />
          </SettingsRow>
          <SettingsRow title="Owner">
            <input aria-label="Owner" maxLength={100} value={info.owner} placeholder="Team phụ trách" onChange={(e) => setInfo({ ...info, owner: e.target.value })} />
          </SettingsRow>
        </div>
        <div className="settings-actions"><button type="button" className="button primary" disabled={busy} onClick={saveInfo}>Lưu thông tin</button></div>
      </section>

      <section className="settings-group">
        <h2>Kết nối</h2>
        {env ? (
          <p className="settings-hint">Địa chỉ {target.origin} và token được cấu hình bằng LAB_MONITORING_TARGETS trên Railway.</p>
        ) : (
          <div className="settings-list">
            <SettingsRow title="Địa chỉ tool" description="Để trống để ngắt kết nối (tool hiện No data).">
              <input aria-label="Địa chỉ tool" type="url" value={conn.origin} placeholder="https://app.up.railway.app" onChange={(e) => { setConn({ ...conn, origin: e.target.value }); setProbe(null) }} />
            </SettingsRow>
            {conn.origin && (
              <SettingsRow title="Token monitoring" description={conn.origin === target.origin ? "Để trống để giữ token đã lưu." : "Bắt buộc khi đổi địa chỉ."}>
                <input aria-label="Token monitoring" type="password" minLength={32} value={conn.token} placeholder="••••••••" autoComplete="new-password" onChange={(e) => { setConn({ ...conn, token: e.target.value }); setProbe(null) }} />
              </SettingsRow>
            )}
          </div>
        )}
        {probe && <ProbeResult result={probe} />}
        <div className="settings-actions">
          {(target.connected || conn.origin) && <button type="button" className="button" disabled={busy || !target.tokenReadable && !conn.token} onClick={test}>Kiểm tra</button>}
          {!env && <button type="button" className="button primary" disabled={busy} onClick={saveConnection}>Lưu kết nối</button>}
        </div>
        <div className="settings-list">
          <SettingsRow title="Railway service (tuỳ chọn)" description="URL service trên Railway (có project, service và environmentId) để hiện sự kiện deploy cạnh lịch sử chạy.">
            <input aria-label="Railway service URL" type="url" value={conn.railwayUrl} placeholder="https://railway.com/project/…/service/…?environmentId=…" onChange={(e) => setConn({ ...conn, railwayUrl: e.target.value })} />
          </SettingsRow>
          {conn.railwayUrl && (
            <SettingsRow title="Railway project token" description={target.railway ? "Để trống để giữ token đã lưu. Chỉ cần quyền đọc." : "Project Access Token của đúng project/environment. Được mã hóa, không hiển thị lại."}>
              <input aria-label="Railway project token" type="password" value={conn.railwayToken} placeholder={target.railway ? "••••••••" : "Nhập token"} autoComplete="new-password" onChange={(e) => setConn({ ...conn, railwayToken: e.target.value })} />
            </SettingsRow>
          )}
        </div>
        <div className="settings-actions"><button type="button" className="button" disabled={busy || (conn.railwayUrl && !target.railway && !conn.railwayToken)} onClick={saveRailway}>Lưu liên kết Railway</button></div>
      </section>

      <section className="settings-group">
        <h2>Job & target</h2>
        <ProfileSummary tool={target.tool} connected={target.connected} />
        {target.connected && <div className="settings-actions"><button type="button" className="button" disabled={busy || !target.tokenReadable} onClick={detect}>{target.tool ? "Nhận diện lại" : "Nhận diện ngay"}</button></div>}
        {target.tool && <ProfileEditor key={target.tool.detectedAt + JSON.stringify(target.tool.jobs.map((j) => [j.targetMinutes, j.role]))} target={target} busy={busy} onSave={saveProfile} onReset={resetProfile} />}
      </section>

      {!env && (
        <section className="settings-group">
          <h2>Xóa tool</h2>
          {confirmDelete ? (
            <div className="settings-actions">
              <span className="settings-hint">Xóa tool, token và các giá trị đã điều chỉnh. Không hoàn tác được.</span>
              <button type="button" className="button danger" disabled={busy} onClick={remove}>Xác nhận xóa</button>
              <button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Hủy</button>
            </div>
          ) : <button type="button" className="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Xóa tool</button>}
        </section>
      )}
      <Messages error={error} notice={notice} />
    </div>
  )
}

// Side panel used by the Status tab for connecting and editing tools.
export function Drawer({ title, onClose, children }) {
  const panel = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    panel.current?.focus()
    const onKey = (e) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      previous?.focus?.()
    }
  }, [])
  return (
    <div className="tool-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="tool-drawer settings-page" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </aside>
    </div>
  )
}
