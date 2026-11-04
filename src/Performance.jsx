import React, { useEffect, useRef, useState } from "react"
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Server,
  GitBranch,
  Clock,
  CheckCircle2,
} from "lucide-react"
import "./performance.css"

const number = (value) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value)
const timestamp = (value) =>
  value ? new Date(value).toLocaleString("vi-VN") : "Chưa có tín hiệu"
const duration = (ms) =>
  ms == null
    ? "—"
    : ms < 1000
      ? number(ms) + " ms"
      : ms < 60000
        ? number(ms / 1000) + " giây"
        : number(ms / 60000) + " phút"
const connectionLabels = {
  ready: "Sẵn sàng",
  stale: "Tín hiệu quá hạn",
  error: "Lỗi checkout",
  unknown: "Chưa có tín hiệu",
  paused: "Đã tạm dừng",
  disabled: "Runner chưa bật",
}
const statusLabels = {
  completed: "Đã nghiệm thu",
  rejected: "Đã dừng",
  feedback: "Đã tiếp nhận",
  draft: "Bản nháp",
  "needs-triage": "Cần xử lý",
  "awaiting-approval": "Chờ duyệt",
  approved: "Chờ runner",
  claimed: "Đã nhận",
  running: "Đang chạy",
  verifying: "Đang xác minh",
  rechecking: "Đang kiểm tra lại",
  review: "Chờ nghiệm thu",
  failed: "Cần xử lý",
  deployed: "Đã deploy",
  queued: "Đang chờ",
  ci: "Đang kiểm tra CI",
  deploying: "Đang deploy",
}
function Signal({ tone = "neutral", children }) {
  return (
    <span className={"perf-signal " + tone}>
      <span aria-hidden="true" />
      {children}
    </span>
  )
}
function PerformanceSelect({ children, ...props }) {
  return (
    <span className="perf-select">
      <select {...props}>{children}</select>
    </span>
  )
}
const count = (value) => number(Math.round(value))
const percentage = (value) => number(value) + "%"
function AnimatedValue({ value, format = count }) {
  const current = useRef(0)
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame
    const finish = () => {
      cancelAnimationFrame(frame)
      current.current = value
      setDisplay(value)
    }
    const from = current.current ?? 0
    if (value == null || motion.matches || from === value) {
      finish()
    } else {
      const started = performance.now()
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / 650)
        const next = from + (value - from) * (1 - Math.pow(1 - progress, 3))
        current.current = next
        setDisplay(next)
        if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    const onMotion = () => {
      if (motion.matches) finish()
    }
    motion.addEventListener("change", onMotion)
    return () => {
      cancelAnimationFrame(frame)
      motion.removeEventListener("change", onMotion)
    }
  }, [value])
  return (
    <>
      <span aria-hidden="true">
        {value == null ? "—" : format(display ?? 0)}
      </span>
      <span className="sr-only">{value == null ? "—" : format(value)}</span>
    </>
  )
}
function Metric({
  icon: Icon,
  label,
  value,
  note,
  tone = "neutral",
  surface,
  format,
}) {
  return (
    <article
      className="perf-card perf-metric"
      data-tone={tone}
      data-surface={surface}
    >
      <div className="perf-card-label">
        <Icon size={16} aria-hidden="true" />
        {label}
      </div>
      <strong>
        <AnimatedValue value={value} format={format} />
      </strong>
      <small>{note}</small>
    </article>
  )
}

function ProjectRuntime({ api, days, refresh }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("all")
  useEffect(() => {
    let cancelled = false,
      inFlight = false
    setData(null)
    async function load() {
      if (inFlight) return
      inFlight = true
      try {
        const report = await api("/monitoring?days=" + days)
        if (!cancelled) {
          setData(report)
          setError("")
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        inFlight = false
      }
    }
    load()
    const timer = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [days, refresh])
  return (
    <>
      <div className="perf-section-heading">
        <div>
          <h2>Vận hành ứng dụng</h2>
          <p>
            Số liệu trực tiếp từ app · cửa sổ báo cáo UTC · tự cập nhật 30 giây
          </p>
        </div>
        <PerformanceSelect
          aria-label="Lọc ứng dụng monitoring"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="all">Tất cả ứng dụng</option>
          {data?.targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </PerformanceSelect>
      </div>
      {error && (
        <p className="perf-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && (
        <div className="perf-loading" role="status">
          Đang đọc số liệu ứng dụng…
        </div>
      )}
      {data?.configurationError && (
        <p className="perf-error">Cấu hình kết nối monitoring không hợp lệ.</p>
      )}
      {data && !data.configurationError && !data.targets.length && (
        <p className="perf-card perf-empty">
          Chưa cấu hình kết nối monitoring chỉ đọc.
        </p>
      )}
      {data?.targets
        .filter((t) => selected === "all" || selected === t.id)
        .map((t) => <RuntimeReport key={t.id} target={t} days={days} />)}
    </>
  )
}
const money = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(v)
const bytes = (v) => number(v / 1048576) + " MB"
const show = (value, format = number) =>
  value == null ? "Chưa có dữ liệu" : format(value)
function RuntimeReport({ target: t, days }) {
  const r = t.report,
    http = r?.http,
    ai = r?.ai,
    rt = r?.runtime
  const observedDays = r?.coverage?.firstMeasuredHour ? Math.max(1,Math.min(days,Math.floor((Date.parse(r.generatedAt.slice(0,10))-Date.parse(r.coverage.firstMeasuredHour.slice(0,10)))/86400000)+1)) : null
  const ledger = r?.ledger?.models || []
  const totals = ledger.reduce(
    (a, v) => {
      for (const k of [
        "calls",
        "cache_hits",
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "priced_calls",
      ])
        a[k] = (a[k] || 0) + Number(v[k] || 0)
      a.cost += Number(v.known_cost_usd || 0)
      return a
    },
    { cost: 0 },
  )
  const max = Math.max(1, ...(r?.timeline || []).map((v) => v.calls))
  const tone =
    t.status === "ready"
      ? "success"
      : t.status === "degraded"
        ? "warning"
        : "error"
  return (
    <section className="perf-project-report">
      <header className="perf-project-heading">
        <div>
          <span className="eyebrow">APPLICATION MONITORING</span>
          <h2>{t.name}</h2>
          <p className="perf-repository">{t.origin}</p>
        </div>
        <Signal tone={tone}>
          {t.status === "ready"
            ? "App & database phản hồi"
            : t.status === "unauthorized"
              ? "Không xác thực được"
              : "Thiếu tín hiệu / cần kiểm tra"}
        </Signal>
      </header>
      {!r ? (
        <div className="perf-card perf-empty">
          Chưa đọc được endpoint monitoring. Không suy diễn số liệu bằng 0.
        </div>
      ) : (
        <>
          <div className="perf-metrics">
            <Metric
              icon={Activity}
              label="HTTP requests"
              value={http.calls}
              surface="blue"
              note="API ứng dụng · không gồm file tĩnh và monitor"
            />
            <Metric
              icon={Clock}
              label="Phản hồi HTTP trung bình"
              value={http.averageMs}
              format={duration}
              surface="yellow"
              note={
                "P95 " + duration(http.p95Ms) + " · P99 " + duration(http.p99Ms)
              }
            />
            <Metric
              icon={CheckCircle2}
              label="Tỉ lệ lỗi máy chủ"
              value={http.errorRate}
              format={percentage}
              surface={http.failed ? "rose" : "lime"}
              note={
                number(http.failed) +
                " lỗi 5xx · " +
                number(http.clientErrors) +
                " phản hồi 4xx"
              }
            />
            <Metric
              icon={GitBranch}
              label="Tổng bài viết"
              value={r.articles?.total ?? null}
              surface="ink"
              note="Kho hiện tại · loại trùng theo ID"
            />
          </div>
          <div className="perf-grid">
            <article className="perf-card perf-system-card">
              <div className="perf-card-heading">
                <div>
                  <h2>Sơ đồ kết nối</h2>
                  <p>Trạng thái từng tầng tại thời điểm đọc báo cáo</p>
                </div>
              </div>
              <ol
                className="perf-connection-flow"
                aria-label="Ứng dụng tới database và AI provider"
              >
                <li>
                  <Server size={20} />
                  <strong>{t.name}</strong>
                  <Signal tone="success">Đang phản hồi</Signal>
                </li>
                <li>
                  <Activity size={20} />
                  <strong>Database</strong>
                  <Signal
                    tone={
                      r.database?.status === "ready" ? "success" : "warning"
                    }
                  >
                    {r.database?.status === "ready"
                      ? "Truy vấn thành công"
                      : "Chưa xác minh"}
                  </Signal>
                </li>
                <li>
                  <GitBranch size={20} />
                  <strong>AI providers</strong>
                  <Signal tone={ai.failed ? "warning" : "neutral"}>
                    {ai.calls
                      ? number(ai.calls) + " lượt gọi đã ghi nhận"
                      : "Chưa có mẫu trong kỳ"}
                  </Signal>
                </li>
              </ol>
              <p className="perf-footnote">
                AI phản ánh kết quả gọi đã ghi nhận; không thực hiện thêm lượt
                gọi AI để kiểm tra online.
              </p>
              <dl className="perf-health">
                <div>
                  <dt>Database round trip</dt>
                  <dd>{show(r.database?.responseMs, duration)}</dd>
                </div>
                <div>
                  <dt>Pool tổng / rảnh / chờ</dt>
                  <dd>
                    {r.database?.poolTotal ?? "—"} /{" "}
                    {r.database?.poolIdle ?? "—"} /{" "}
                    {r.database?.poolWaiting ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>App → Lab</dt>
                  <dd>{duration(t.fetchMs)} · gồm truy vấn monitoring</dd>
                </div>
              </dl>
            </article>
            <article className="perf-card perf-system-card">
              <div className="perf-card-heading">
                <div>
                  <h2>Tiến trình máy chủ</h2>
                  <p>Instance hiện tại · CPU theo một lõi, có thể vượt 100%</p>
                </div>
                <Server size={20} />
              </div>
              <dl className="perf-health">
                {[
                  ["CPU", show(rt.cpuPercent, percentage)],
                  ["RAM RSS", show(rt.rssBytes, bytes)],
                  [
                    "Heap dùng / tổng",
                    show(rt.heapUsedBytes, bytes) +
                      " / " +
                      show(rt.heapTotalBytes, bytes),
                  ],
                  ["Uptime", duration(rt.uptimeSeconds * 1000)],
                  ["HTTP / AI đang xử lý", http.inFlight + " / " + ai.inFlight],
                  ["Node.js", rt.nodeVersion],
                  ["Commit", rt.commit?.slice(0, 12) || "Chưa xác định"],
                  ["Tiến trình bắt đầu", timestamp(rt.startedAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>
          <div className="perf-metrics">
            <Metric
              icon={Activity}
              label="AI calls"
              value={ai.calls}
              surface="blue"
              note={
                ai.failed +
                " lượt lỗi · " +
                duration(ai.averageMs) +
                " trung bình"
              }
            />
            <Metric
              icon={ArrowUpRight}
              label="Input / output tokens"
              value={ai.inputTokens + ai.outputTokens}
              surface="yellow"
              note={
                number(ai.inputTokens) +
                " input · " +
                number(ai.outputTokens) +
                " output · " +
                ai.usageSamples +
                "/" +
                ai.calls +
                " có usage"
              }
            />
            <Metric
              icon={CheckCircle2}
              label="Chi phí AI đã định giá"
              value={ai.knownCostUsd}
              format={money}
              surface="lime"
              note={
                ai.pricedCalls + "/" + ai.calls + " lượt có giá · USD ước tính"
              }
            />
            <Metric
              icon={Clock}
              label="Chi phí TB / lượt có giá"
              value={ai.averageKnownCostPerCall}
              format={money}
              surface="ink"
              note={
                "TB/ngày có quan sát: " +
                show(
                  ai.knownCostUsd == null || !observedDays ? null : ai.knownCostUsd / observedDays,
                  money,
                )
              }
            />
          </div>
          <div className="perf-grid">
            <article className="perf-card perf-trend-card">
              <div className="perf-card-heading">
                <div>
                  <h2>Lưu lượng theo giờ</h2>
                  <p>HTTP requests · UTC · từ khi bắt đầu thu thập</p>
                </div>
              </div>
              <div
                className="perf-chart perf-runtime-chart"
                role="img"
                aria-label={
                  (r.timeline || [])
                    .map(
                      (v) =>
                        v.hour +
                        ": " +
                        v.calls +
                        " HTTP, " +
                        v.errors +
                        " lỗi, " +
                        v.aiCalls +
                        " AI calls",
                    )
                    .join("; ") || "Chưa có mẫu lưu lượng"
                }
              >
                {(r.timeline || []).map((v, i) => (
                  <div className="perf-bar-column" key={v.hour}>
                    <span className="perf-bar-count">{v.calls}</span>
                    <div className="perf-bar-track">
                      <div
                        className="perf-bar"
                        style={{
                          height: (v.calls / max) * 100 + "%",
                          "--bar-index": Math.min(i, 15),
                        }}
                        title={
                          v.hour +
                          " · " +
                          v.calls +
                          " HTTP · " +
                          v.errors +
                          " lỗi"
                        }
                      />
                    </div>
                    <small>
                      {v.hour.slice(8, 10) + "/" + v.hour.slice(11, 13) + "h"}
                    </small>
                  </div>
                ))}
              </div>
            </article>
            <article className="perf-card">
              <div className="perf-card-heading">
                <div>
                  <h2>Kho nội dung</h2>
                  <p>Trạng thái hiện tại · độc lập với cửa sổ HTTP/AI</p>
                </div>
              </div>
              <dl className="perf-health">
                <div>
                  <dt>Content plans (bảng quan hệ)</dt>
                  <dd>{show(r.plans?.total)}</dd>
                </div>
                {r.articles?.byStatus.map((v) => (
                  <div key={v.status}>
                    <dt>{v.status}</dt>
                    <dd>{number(v.count)}</dd>
                  </div>
                ))}
              </dl>
              {!r.articles && (
                <p className="perf-footnote">Chưa đọc được kho bài viết.</p>
              )}
            </article>
          </div>
          <article className="perf-card perf-recent">
            <div className="perf-card-heading">
              <div>
                <h2>Workflow · hàng đợi · chất lượng</h2>
                <p>
                  Snapshot các bảng quan hệ hiện có · không suy diễn trạng thái
                  worker từ hàng đợi
                </p>
              </div>
            </div>
            <div className="perf-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Thành phần</th>
                    <th>Trạng thái / số lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(r.inventory || {}).map(([name, rows]) => (
                    <tr key={name}>
                      <td>
                        {{
                          content_plan_items: "Hạng mục content plan",
                          article_stage_runs: "Lượt chạy từng giai đoạn",
                          batch_jobs: "Batch jobs",
                          batch_job_items: "Hạng mục batch",
                          quality_gate_runs: "Quality gates",
                          editorial_approvals: "Phê duyệt biên tập",
                          website_content_inventory: "Kho website",
                        }[name] || name}
                      </td>
                      <td>
                        {rows === null
                          ? "Chưa có bảng dữ liệu"
                          : rows.length
                            ? rows
                                .map((v) => v.status + ": " + number(v.count))
                                .join(" · ")
                            : "0 bản ghi"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <article className="perf-card perf-recent">
            <div className="perf-card-heading">
              <div>
                <h2>AI usage theo provider / model</h2>
                <p>
                  Dispatcher đã instrument · cached input nằm trong input ·
                  không cộng với ledger bên dưới
                </p>
              </div>
            </div>
            <div className="perf-table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Provider : model",
                      "Calls / lỗi",
                      "Input",
                      "Cached input",
                      "Output",
                      "Có usage / giá",
                      "Chi phí ước tính",
                      "P95",
                    ].map((v) => (
                      <th key={v}>{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ai.models.map((m) => (
                    <tr key={m.model}>
                      <td>{m.model}</td>
                      <td>
                        {m.calls} / {m.failed}
                      </td>
                      <td>{number(m.inputTokens)}</td>
                      <td>{number(m.cachedInputTokens)}</td>
                      <td>{number(m.outputTokens)}</td>
                      <td>
                        {m.usageSamples} / {m.pricedCalls}
                      </td>
                      <td>{show(m.knownCostUsd, money)}</td>
                      <td>{duration(m.p95Ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!ai.models.length && (
              <p className="perf-empty">
                Chưa có lượt gọi AI được đo trong kỳ.
              </p>
            )}
          </article>
          <article className="perf-card perf-recent">
            <div className="perf-card-heading">
              <div>
                <h2>AI ledger đã lưu của ứng dụng</h2>
                <p>
                  Lịch sử workflow trong kỳ · có thể chỉ bao phủ một phần hoạt
                  động · không cộng vào dispatcher
                </p>
              </div>
            </div>
            <p className="perf-footnote">
              {r.ledger
                ? number(totals.calls || 0) +
                  " lượt đã lưu · " +
                  number(totals.cache_hits || 0) +
                  " cache hits · " +
                  number(totals.input_tokens || 0) +
                  " input / " +
                  number(totals.output_tokens || 0) +
                  " output tokens · " +
                  show(totals.priced_calls ? totals.cost : null, money) +
                  " đã định giá (" +
                  (totals.priced_calls || 0) +
                  " lượt)"
                : "Chưa đọc được ledger lịch sử."}
            </p>
            <div className="perf-table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Provider / model",
                      "Bước",
                      "Calls / cache hits",
                      "Input / cached / output",
                      "Có giá",
                      "USD ước tính",
                    ].map((v) => (
                      <th key={v}>{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((m, i) => (
                    <tr key={i}>
                      <td>
                        {m.provider} / {m.model}
                      </td>
                      <td>{m.step}</td>
                      <td>
                        {m.calls} / {m.cache_hits}
                      </td>
                      <td>
                        {number(m.input_tokens)} /{" "}
                        {number(m.cached_input_tokens)} /{" "}
                        {number(m.output_tokens)}
                      </td>
                      <td>
                        {m.priced_calls} / {m.calls}
                      </td>
                      <td>{show(m.known_cost_usd, money)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <article className="perf-card perf-recent">
            <div className="perf-card-heading">
              <div>
                <h2>HTTP theo route</h2>
                <p>Chỉ tên route, không chứa URL người dùng hoặc query</p>
              </div>
            </div>
            <div className="perf-table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Route",
                      "Requests",
                      "5xx / 4xx / hủy",
                      "Trung bình",
                      "P50 / P95 / P99",
                      "Cao nhất",
                    ].map((v) => (
                      <th key={v}>{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {http.routes.map((v) => (
                    <tr key={v.route}>
                      <td>{v.route}</td>
                      <td>{v.calls}</td>
                      <td>
                        {v.failed} / {v.clientErrors} / {v.aborted}
                      </td>
                      <td>{duration(v.averageMs)}</td>
                      <td>
                        {duration(v.p50Ms)} / {duration(v.p95Ms)} /{" "}
                        {duration(v.p99Ms)}
                      </td>
                      <td>{duration(v.maxMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <p className="perf-footnote">
            Cập nhật {timestamp(r.generatedAt)} · bắt đầu có mẫu{" "}
            {timestamp(r.coverage.firstMeasuredHour)} · P50/P95/P99 là cận trên
            histogram. AI calls là lượt qua dispatcher, không bao gồm từng retry
            nội bộ SDK. Chi phí tính theo giá model được cấu hình, chưa phải hóa
            đơn provider. Số liệu có thể mất tối đa 5 giây khi tiến trình dừng
            đột ngột.
          </p>
          {(!r.coverage.complete || r.coverage.recordingErrors > 0) && (
            <p className="perf-error">
              Phạm vi thu thập chưa đầy đủ · {r.coverage.recordingErrors} lỗi
              ghi nhận.
            </p>
          )}
          <p className="perf-footnote">
            Chưa thu thập: giới hạn container, disk/network, toàn bộ replica,
            người dùng hoạt động, lỗi JavaScript và trải nghiệm trình duyệt, hóa
            đơn provider. Các chỉ số này cần thêm tích hợp Railway/RUM/billing.
          </p>
        </>
      )}
    </section>
  )
}

export default function Performance({ api, onRequest }) {
  const [days, setDays] = useState(7),
    [scope, setScope] = useState("lab"),
    [projectId, setProjectId] = useState("all")
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0)
  const reportProject = projectId
  useEffect(() => {
    setData(null)
  }, [days, reportProject])
  useEffect(() => {
    let cancelled = false,
      inFlight = false
    async function load() {
      if (inFlight) return
      inFlight = true
      setBusy(true)
      try {
        const next = await api(
          "/performance?days=" +
            days +
            (reportProject === "all"
              ? ""
              : "&projectId=" + encodeURIComponent(reportProject)),
        )
        if (!cancelled) {
          setData(next)
          setError("")
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        inFlight = false
        if (!cancelled) setBusy(false)
      }
    }
    load()
    const timer = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [days, refresh, reportProject])
  const projects =
    data?.projects.filter((p) => projectId === "all" || p.id === projectId) ||
    []
  const recent =
    data?.recent.filter(
      (r) => projectId === "all" || r.projectId === projectId,
    ) || []
  const summary = data?.summary,
    lab = data?.lab
  const maximum = Math.max(1, ...(data?.trend.map((v) => v.created) || []))
  return (
    <section className="performance-page" aria-labelledby="performance-title">
      <div className="perf-heading">
        <div>
          <span className="eyebrow">WORKSPACE ANALYTICS</span>
          <h1 id="performance-title">Performance</h1>
          <p>Theo dõi sức khỏe Lab và hoạt động của các project.</p>
        </div>
        <div className="perf-toolbar">
          <label>
            <span className="sr-only">Khoảng thời gian báo cáo</span>
            <PerformanceSelect
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>Hôm nay · UTC</option>
              <option value={7}>7 ngày qua</option>
              <option value={30}>30 ngày qua</option>
            </PerformanceSelect>
          </label>
          <button
            className="button"
            disabled={busy}
            onClick={() => setRefresh((v) => v + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Làm mới
          </button>
        </div>
      </div>
      <div className="perf-subnav">
        <div className="perf-switch" role="group" aria-label="Phạm vi báo cáo">
          <button
            aria-pressed={scope === "lab"}
            onClick={() => setScope("lab")}
          >
            <Server size={15} />
            AI Agent Lab
          </button>
          <button
            aria-pressed={scope === "projects"}
            onClick={() => setScope("projects")}
          >
            <GitBranch size={15} />
            Projects
          </button>
        </div>
        <small>
          {data
            ? "Cập nhật " +
              timestamp(data.generatedAt) +
              " · Tự làm mới 30 giây"
            : "Đang kết nối dữ liệu"}
        </small>
      </div>
      {error && (
        <div className="perf-error" role="alert">
          {error} {data && "Đang hiển thị dữ liệu đã tải trước đó."}
          <button
            className="button"
            disabled={busy}
            onClick={() => setRefresh((v) => v + 1)}
          >
            Thử lại
          </button>
        </div>
      )}
      {!data && !error && (
        <div className="perf-loading" role="status">
          <span className="sr-only">Đang tải báo cáo vận hành…</span>
          <div className="perf-skeleton-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div className="perf-skeleton" key={i} />
            ))}
          </div>
        </div>
      )}
      {data && (
        <div className="perf-report" key={scope + days + reportProject}>
          {scope === "lab" ? (
            <>
              <div className="perf-section-heading">
                <div>
                  <h2>Hoạt động AI Agent Lab</h2>
                  <p>
                    Feedback được lọc theo project; HTTP và sức khỏe máy chủ
                    phản ánh toàn bộ Lab.
                  </p>
                </div>
                <PerformanceSelect
                  aria-label="Lọc project của Lab"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="all">Tất cả project</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </PerformanceSelect>
              </div>
              <div className="perf-metrics">
                <Metric
                  icon={Activity}
                  label="Lượt gọi API"
                  tone={lab.http.calls ? "info" : "neutral"}
                  value={lab.http.calls}
                  surface="blue"
                  note="Toàn bộ Lab · không tách HTTP theo project"
                />
                <Metric
                  icon={CheckCircle2}
                  label="Phản hồi không lỗi máy chủ"
                  tone={
                    !lab.http.calls
                      ? "neutral"
                      : lab.http.errors
                        ? "error"
                        : "success"
                  }
                  surface={
                    lab.http.errors ? "rose" : lab.http.calls ? "lime" : "ink"
                  }
                  format={percentage}
                  value={
                    lab.http.calls
                      ? (100 * (lab.http.calls - lab.http.errors)) /
                        lab.http.calls
                      : null
                  }
                  note={
                    number(lab.http.errors) +
                    " phản hồi 5xx · " +
                    number(lab.http.clientErrors) +
                    " phản hồi 4xx"
                  }
                />
                <Metric
                  icon={Clock}
                  label="Thời gian phản hồi TB"
                  tone={lab.http.calls ? "info" : "neutral"}
                  value={lab.http.averageMs}
                  format={duration}
                  surface="yellow"
                  note={"Cao nhất " + duration(lab.http.maxMs)}
                />
                <Metric
                  icon={GitBranch}
                  label="Đang vận hành"
                  tone={lab.active ? "info" : "neutral"}
                  value={lab.active}
                  surface="ink"
                  note={
                    number(lab.running) + " request đang xử lý · toàn thời gian"
                  }
                />
              </div>
              <div className="perf-grid">
                <article className="perf-card perf-trend-card">
                  <div className="perf-card-heading">
                    <div>
                      <h2>Feedback theo thời gian</h2>
                      <p>{number(summary.total)} feedback được tạo trong kỳ</p>
                    </div>
                    <span className="perf-tag">UTC</span>
                  </div>
                  {summary.total === 0 && (
                    <p className="perf-footnote">
                      Chưa có feedback trong kỳ này.
                    </p>
                  )}
                  <div
                    className="perf-chart"
                    role="img"
                    aria-label={
                      "Feedback theo ngày UTC. " +
                      data.trend.map((v) => v.day + ": " + v.created).join(", ")
                    }
                  >
                    {data.trend.map((v) => (
                      <div className="perf-bar-column" key={v.day}>
                        <span className="perf-bar-count">
                          {v.created || ""}
                        </span>
                        <div className="perf-bar-track">
                          <div
                            className="perf-bar"
                            style={{
                              "--bar-index": data.trend.indexOf(v),
                              height: (v.created / maximum) * 100 + "%",
                            }}
                            title={v.day + " · " + v.created + " feedback"}
                          />
                        </div>
                        <small>{v.day.slice(8)}</small>
                      </div>
                    ))}
                  </div>
                  <div className="perf-chart-footer">
                    <span>{data.trend[0]?.day}</span>
                    <span>{data.trend.at(-1)?.day}</span>
                  </div>
                </article>
                <article className="perf-card perf-system-card">
                  <div className="perf-card-heading">
                    <div>
                      <h2>Sức khỏe hệ thống</h2>
                      <p>Tín hiệu hiện tại từ Lab</p>
                    </div>
                    <Server size={18} />
                  </div>
                  <dl className="perf-health">
                    <div>
                      <dt>API</dt>
                      <dd>
                        <Signal tone="success">Đang phản hồi</Signal>
                      </dd>
                    </div>
                    <div>
                      <dt>SQLite</dt>
                      <dd>
                        <Signal tone="success">Truy vấn thành công</Signal>
                      </dd>
                    </div>
                    <div>
                      <dt>Mac runner</dt>
                      <dd>
                        <Signal
                          tone={lab.runner.connected ? "success" : "warning"}
                        >
                          {lab.runner.connected
                            ? "Đã kết nối"
                            : "Chưa có tín hiệu mới"}
                        </Signal>
                      </dd>
                    </div>
                    <div>
                      <dt>Heartbeat gần nhất</dt>
                      <dd>{timestamp(lab.runner.lastSeenAt)}</dd>
                    </div>
                    <div>
                      <dt>Thời gian chạy tiến trình</dt>
                      <dd>{duration(lab.uptimeSeconds * 1000)}</dd>
                    </div>
                  </dl>
                  <p className="perf-footnote">
                    Thống kê HTTP lưu tối đa 31 ngày, bắt đầu từ khi cài phiên
                    bản này. Kiểm tra online thực hiện khi tải báo cáo. Theo dõi
                    mất kết nối toàn bộ Lab cần monitor bên ngoài.
                  </p>
                  {lab.recordingErrors > 0 && (
                    <p className="perf-error">
                      Có {lab.recordingErrors} lần ghi thống kê thất bại. Số
                      lượt gọi có thể chưa đầy đủ.
                    </p>
                  )}
                </article>
              </div>
              <div className="perf-metrics">
                <Metric
                  icon={GitBranch}
                  label="Project đã kết nối"
                  tone={data.projects.length ? "info" : "neutral"}
                  value={data.projects.length}
                  note={
                    data.projects.filter((p) => p.enabled).length +
                    " project đang bật"
                  }
                />
                <Metric
                  icon={CheckCircle2}
                  label="Đã nghiệm thu"
                  tone={summary.completed ? "success" : "neutral"}
                  value={summary.completed}
                  note="Theo nhóm feedback được tạo trong kỳ"
                />
                <Metric
                  icon={ArrowUpRight}
                  label="Đã deploy"
                  tone={summary.deployed ? "success" : "neutral"}
                  value={summary.deployed}
                  surface="yellow"
                  note="Trạng thái phát hành được Lab ghi nhận"
                />
                <Metric
                  icon={Clock}
                  label="P95 thời gian tới deploy"
                  tone={summary.deliverySamples ? "info" : "neutral"}
                  value={summary.p95DeliveryMs}
                  format={duration}
                  note={
                    summary.deliverySamples +
                    " mẫu · gồm thời gian chờ và xử lý" +
                    (summary.missingDeploymentTimes
                      ? " · " +
                        summary.missingDeploymentTimes +
                        " thiếu mốc deploy"
                      : "")
                  }
                />
              </div>
            </>
          ) : (
            <ProjectRuntime api={api} days={days} refresh={refresh} />
          )}
          {scope === "lab" && (
            <>
              <article className="perf-card perf-recent">
                <div className="perf-card-heading">
                  <div>
                    <h2>Hoạt động gần đây</h2>
                    <p>
                      Tối đa 50 feedback mới nhất trong kỳ, sắp xếp theo lần cập
                      nhật.
                    </p>
                  </div>
                </div>
                <div className="perf-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Feedback</th>
                        <th>Project</th>
                        <th>Trạng thái hiện tại</th>
                        <th>Cập nhật</th>
                        <th>
                          <span className="sr-only">Chi tiết</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scope === "lab" ? data.recent : recent).map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button
                              className="perf-request"
                              onClick={() => onRequest(r.id)}
                            >
                              {r.title || r.id}
                            </button>
                          </td>
                          <td>
                            {data.projects.find((p) => p.id === r.projectId)
                              ?.name || r.projectId}
                          </td>
                          <td>
                            <Signal
                              tone={
                                r.failed
                                  ? "error"
                                  : r.releasePhase === "deployed"
                                    ? "success"
                                    : "neutral"
                              }
                            >
                              {statusLabels[r.releasePhase || r.status] ||
                                r.status}
                            </Signal>
                          </td>
                          <td>{timestamp(r.updatedAt)}</td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={"Xem feedback " + (r.title || r.id)}
                              onClick={() => onRequest(r.id)}
                            >
                              <ArrowUpRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!(scope === "lab" ? data.recent : recent).length && (
                  <div className="perf-empty">
                    Chưa có feedback trong khoảng thời gian đã chọn.
                  </div>
                )}
              </article>
              <p className="perf-footnote">
                Dữ liệu request đã lưu · loại trừ thùng rác. Các chỉ số trong kỳ
                theo ngày tạo feedback, trạng thái phản ánh lần cập nhật mới
                nhất. Biểu đồ theo UTC, thời điểm hiển thị theo múi giờ thiết
                bị. Thời lượng deploy tính tới lúc Lab xác nhận thành công;
                request thiếu mốc thời gian được loại khỏi mẫu P95.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
