import { ActivePill } from "./motion.jsx"
import {startPolling} from './polling.js';
import TaskUsage from "./TaskUsage.jsx";
import AnimatedValue from "./AnimatedValue.jsx"
import { RuntimeOverview, AICharts, WorkflowStatus } from "./RuntimeCharts.jsx"
import { appProfile, jobCompletionTarget, projectJobHistoryMetrics, projectPerformanceMetrics } from "./runtime-chart-data.js"
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
  FlaskConical,
  Github,
  Maximize,
  Minus,
  Network,
  Plus,
  X,
} from "lucide-react"
import "./performance.css"
import "./performance-theme.css"

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
const connectionSignals = {
  ready: { label: "Sẵn sàng", tone: "success" },
  stale: { label: "Tín hiệu quá hạn", tone: "warning" },
  error: { label: "Lỗi checkout", tone: "error" },
  unknown: { label: "Chưa có tín hiệu", tone: "neutral" },
  paused: { label: "Đã tạm dừng", tone: "neutral" },
  disabled: { label: "Runner chưa bật", tone: "neutral" },
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
function ConnectionNode({ icon: Icon, name, subtitle, signal, selected, onSelect, x, y }) {
  return (
    <button
      type="button"
      className="perf-topology-node"
      style={{ left: x, top: y }}
      aria-pressed={selected}
      aria-controls={selected ? "perf-connection-details" : undefined}
      onClick={onSelect}
    >
      <span className="perf-topology-node-heading">
        <Icon size={22} aria-hidden="true" />
        <span>
          <strong title={name}>{name}</strong>
          <small title={subtitle}>{subtitle}</small>
        </span>
      </span>
      <Signal tone={signal.tone}>{signal.label}</Signal>
    </button>
  )
}

const nodeHeight = 136
const columnGap = 72
const rowGap = 96
const canvasGutter = 24

function ConnectionMap({ projects, runner }) {
  const [selection, setSelection] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [viewportWidth, setViewportWidth] = useState(0)
  const viewportRef = useRef(null)
  const openerRef = useRef(null)
  const closeRef = useRef(null)
  useEffect(() => {
    const viewport = viewportRef.current
    const observer = new ResizeObserver(() => setViewportWidth(viewport.clientWidth))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const nodeWidth = viewportWidth ? Math.min(264, Math.max(180, viewportWidth - canvasGutter * 2)) : 264
  const columns = Math.max(1, Math.min(
    3,
    projects.length,
    Math.floor((viewportWidth - canvasGutter * 2 + columnGap) / (nodeWidth + columnGap)),
  ))
  const rows = Math.ceil(projects.length / columns)
  const width = columns * (nodeWidth + columnGap) - columnGap + canvasGutter * 2
  const height = 500 + Math.max(0, rows - 1) * (nodeHeight + rowGap)
  const hubX = (width - nodeWidth) / 2
  const hubY = rows ? 62 : 158
  const hubCenter = width / 2
  const hubBottom = hubY + nodeHeight
  const nodes = projects.map((item, index) => {
    const row = Math.floor(index / columns)
    const count = Math.min(columns, projects.length - row * columns)
    const x = (width - count * (nodeWidth + columnGap) + columnGap) / 2
      + (index % columns) * (nodeWidth + columnGap)
    const y = hubBottom + rowGap + row * (nodeHeight + rowGap)
    return { item, x, y }
  })
  const busY = hubBottom + rowGap / 2
  const railX = canvasGutter / 2
  function fitCanvas() {
    const viewport = viewportRef.current
    setZoom(Math.min(1, viewport.clientWidth / width, viewport.clientHeight / height))
    viewport.scrollTo(0, 0)
  }
  function closeDetails() {
    setSelection(null)
    openerRef.current?.focus()
  }
  function toggle(event, next, selected) {
    if (selected) {
      closeDetails()
    } else {
      openerRef.current = event.currentTarget
      setSelection(next)
    }
  }
  useEffect(() => {
    if (selection) closeRef.current?.focus({ preventScroll: true })
  }, [selection])

  const project = projects.find((item) => item.id === selection?.projectId)
  const labSelected = selection?.lab === true
  const projectSignal = (item) => connectionSignals[item.connection] || connectionSignals.unknown
  const runnerSignal = runner.connected
    ? { label: "Mac đã kết nối", tone: "success" }
    : { label: "Mac chưa có tín hiệu mới", tone: "warning" }
  const details = project
    ? [
        ["Repository", project.repository],
        ["Kết nối runner", <Signal tone={projectSignal(project).tone}>{projectSignal(project).label}</Signal>],
        ["Project", project.enabled ? "Đang bật" : "Tạm dừng"],
        ["Mac runner cho project", project.runnerEnabled ? "Đã bật" : "Chưa bật"],
        ["Request đang chạy", number(project.running)],
        ["Request bị chặn trong hàng đợi", number(project.blocked)],
      ]
    : [
        ["API", <Signal tone="success">Đang phản hồi tại lần tải gần nhất</Signal>],
        ["Mac runner", <Signal tone={runnerSignal.tone}>{runnerSignal.label}</Signal>],
        ["Heartbeat Mac gần nhất", timestamp(runner.lastSeenAt)],
        ["Project đã đăng ký", number(projects.length)],
      ]

  return (
    <section className="perf-card perf-topology" aria-labelledby="perf-connection-title">
      <div className="perf-card-heading">
        <div>
          <h2 id="perf-connection-title">Sơ đồ kết nối</h2>
          <p>Chọn AI Agent Lab hoặc một project để xem chi tiết kết nối.</p>
        </div>
        <Network size={18} aria-hidden="true" />
      </div>
      <div
        className="perf-topology-canvas"
        onKeyDown={(event) => {
          if (event.key === "Escape" && (labSelected || project)) closeDetails()
        }}
      >
        <div className="perf-topology-viewport" ref={viewportRef}>
          <div className="perf-topology-stage" style={{ width, height, zoom, "--map-node-width": nodeWidth + "px", "--map-node-height": nodeHeight + "px" }}>
            {nodes.length > 0 && (
              <svg className="perf-topology-wires" width={width} height={height} aria-hidden="true">
                <path d={`M ${hubCenter} ${hubBottom} V ${busY}`} />
                {rows > 1 && (
                  <path d={`M ${hubCenter} ${busY} H ${railX} V ${nodes.at(-1).y - rowGap / 2}`} />
                )}
                {nodes.map(({ item, x, y }) => {
                  const center = x + nodeWidth / 2
                  const branchY = y - rowGap / 2
                  return (
                    <g key={item.id}>
                      <path d={`M ${branchY === busY ? hubCenter : railX} ${branchY} H ${center} V ${y - 7}`} />
                      <polygon points={`${center - 4},${y - 8} ${center + 4},${y - 8} ${center},${y - 2}`} />
                    </g>
                  )
                })}
              </svg>
            )}
            <ConnectionNode
              icon={FlaskConical}
              name="AI Agent Lab"
              subtitle="Điều phối project"
              signal={runnerSignal}
              selected={labSelected}
              x={hubX}
              y={hubY}
              onSelect={(event) => toggle(event, { lab: true }, labSelected)}
            />
            {nodes.length > 0 ? (
              <ul className="perf-topology-projects" aria-label="Project đã đăng ký">
                {nodes.map(({ item, x, y }) => (
                  <li key={item.id}>
                    <ConnectionNode
                      icon={Github}
                      name={item.name}
                      subtitle={item.repository}
                      signal={projectSignal(item)}
                      selected={project?.id === item.id}
                      x={x}
                      y={y}
                      onSelect={(event) => toggle(event, { projectId: item.id }, project?.id === item.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="perf-topology-empty" style={{ top: hubBottom + 24 }}>
                Chưa có project đăng ký.
              </p>
            )}
          </div>
        </div>
        <div className="perf-topology-tools" role="group" aria-label="Thu phóng sơ đồ">
          <button className="icon-button" type="button" aria-label="Phóng to" title="Phóng to" disabled={zoom >= 1.5} onClick={() => setZoom(Math.min(1.5, zoom + 0.2))}>
            <Plus size={16} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" aria-label="Thu nhỏ" title="Thu nhỏ" disabled={zoom <= 0.4} onClick={() => setZoom(Math.max(0.4, zoom - 0.2))}>
            <Minus size={16} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" aria-label="Vừa khung" title="Vừa khung" onClick={fitCanvas}>
            <Maximize size={15} aria-hidden="true" />
          </button>
        </div>
        {(labSelected || project) && (
          <section
            id="perf-connection-details"
            className="perf-topology-details"
            aria-labelledby="perf-connection-details-title"
          >
            <header>
              <div>
                <small className="eyebrow">CHI TIẾT KẾT NỐI</small>
                <h3 id="perf-connection-details-title">{project?.name || "AI Agent Lab"}</h3>
              </div>
              <button className="icon-button" type="button" ref={closeRef} aria-label="Đóng chi tiết kết nối" onClick={closeDetails}>
                <X size={17} aria-hidden="true" />
              </button>
            </header>
            <dl className="perf-health">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
      <p className="perf-footnote">
        Trạng thái project dựa trên cấu hình kết nối và tín hiệu Mac runner của Lab.
      </p>
    </section>
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
        throw e
      } finally {
        inFlight = false
      }
    }
    const polling = startPolling(load, { interval: () => 60000 })
    return () => {
      cancelled = true
      polling.stop()
    }
  }, [days, refresh])
  return (
    <>
      <div className="perf-section-heading">
        <div>
          <h2>Vận hành ứng dụng</h2>
          <p>
            Số liệu trực tiếp từ app · cửa sổ báo cáo UTC · tự cập nhật 60 giây
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
function ProjectPerformanceTargets({ report, profile }) {
  const [historyScope, setHistoryScope] = useState(report.jobHistoryAllTime ? "all" : "period")
  const history = projectJobHistoryMetrics(historyScope === "all" ? report.jobHistoryAllTime : report.jobHistory)
  const metrics = { ...projectPerformanceMetrics(report), ...history }
  const latestJob = history?.latestJob
  const targetMinutes = latestJob ? jobCompletionTarget(report.appId, latestJob.job, profile) : null
  const minutes = (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value) + " phút"
  const range = ([low, high]) => low === high ? rate(low) : rate(low) + "–" + rate(high)
  const rate = (value) =>
    value > 0 && value < 0.01
      ? "< 0,01%"
      : new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 2 }).format(value / 100)
  const sampleCount = (metric) => number(report.performanceKpis[metric].samples) + " mẫu"
  const samples = metrics.executed === null ? "" : " · " + number(metrics.executed) + " job đã thực hiện"
  const rows = [
    {
      name: "Response Time",
      definition: "Từ lúc gửi yêu cầu đến phản hồi có ý nghĩa đầu tiên · P95",
      value: metrics.responseMs,
      format: duration,
      target: "≤ 2,5 giây",
      meets: metrics.responseMs <= 2500,
      note: [
        metrics.responseMs === null ? null : sampleCount("responseTime"),
        metrics.httpP95Ms === null ? null : "Tham chiếu HTTP P95 · " + duration(metrics.httpP95Ms),
      ].filter(Boolean).join(" · "),
    },
    {
      name: "Click Latency",
      definition: "Từ lúc bấm đến phản hồi hiển thị trên UI · P95",
      value: metrics.clickMs,
      format: duration,
      target: "≤ 200 ms",
      meets: metrics.clickMs <= 200,
      note: metrics.clickMs === null ? null : sampleCount("clickLatency"),
    },
    {
      name: "Job Completion Time",
      definition: "Start Event → End Event gần nhất" + (latestJob ? " · " + latestJob.job : ""),
      value: latestJob ? latestJob.durationMs / 60000 : null,
      format: minutes,
      target: targetMinutes === null ? "Chưa có ngưỡng áp dụng" : "≤ " + minutes(targetMinutes),
      meets: targetMinutes === null ? undefined : latestJob.durationMs <= targetMinutes * 60000,
    },
    {
      name: "Error Rate",
      definition: "Job lỗi kỹ thuật / tổng job thực hiện" + samples,
      value: history ? history.errorRange : metrics.errorRate,
      format: history ? range : rate,
      target: "0%",
      meets: history
        ? history.complete && history.errorRange && (history.technicalErrors > 0 || !history.unclassifiedFailures)
          ? history.technicalErrors === 0 : undefined
        : metrics.errorRate === 0,
      note: history
        ? number(history.technicalErrors) + " lỗi kỹ thuật xác định được · " + number(history.unclassifiedFailures) + " lỗi chưa phân loại"
        : metrics.executed > 0 && metrics.errorRate === null ? "Có job chưa xác định được loại lỗi." : null,
    },
    {
      name: "Job Success Rate",
      definition: "Job hoàn thành hợp lệ / tổng job thực hiện" + samples,
      value: history ? history.successRange : metrics.successRate,
      format: history ? range : rate,
      target: "≥ 95% (đề xuất)",
      meets: history
        ? history.complete && history.successRange && !history.unverifiedCompletions
          ? history.successRange[0] >= 95 : undefined
        : metrics.successRate >= 95,
      note: history ? number(history.validCompletions) + " kết quả đã xác minh" +
        (history.unverifiedCompletions ? " · " + number(history.unverifiedCompletions) + " kết quả chưa đủ bằng chứng" : "") : null,
    },
  ]

  return (
    <article className="perf-card perf-project-targets">
      <div className="perf-card-heading">
        <div>
          <h3>Mục tiêu hiệu năng</h3>
          <p>
            Response Time và Click Latency theo kỳ UTC.
            {history && (historyScope === "all" ? " Chỉ số job dùng toàn bộ lịch sử đã lưu." : " Chỉ số job theo kỳ UTC.")}
            {history && !history.complete && " Phạm vi lịch sử chưa đầy đủ."}
          </p>
        </div>
        {report.jobHistoryAllTime ? (
          <PerformanceSelect aria-label="Phạm vi lịch sử job" value={historyScope} onChange={(event) => setHistoryScope(event.target.value)}>
            <option value="all">Toàn bộ lịch sử job</option>
            <option value="period">Theo kỳ báo cáo</option>
          </PerformanceSelect>
        ) : <Activity size={18} aria-hidden="true" />}
      </div>
      <div className="perf-table-scroll">
        <table>
          <thead>
            <tr><th scope="col">Chỉ số</th><th scope="col">Đo lường</th><th scope="col">Mục tiêu</th></tr>
          </thead>
          <tbody>
            {rows.map(({ name, definition, value, format, target, meets, note }) => (
              <tr key={name}>
                <th scope="row">{name}<small>{definition}</small></th>
                <td>
                  {value === null ? <Signal>Chưa có dữ liệu đo</Signal> : format(value)}
                  {note && <small>{note}</small>}
                </td>
                <td>
                  {value === null || meets === undefined
                    ? target
                    : <Signal tone={meets ? "success" : "warning"}>{target} · {meets ? "Đạt" : "Chưa đạt"}</Signal>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

const workloadLabels = {
  "seo-batch": {
    title: "Batch bài viết SEO",
    steps: ["Đọc content plan", "Tạo từng bài", "Hoàn thành batch"],
    articles: "Bài SEO đã hoàn thành",
  },
  "eb-v2": {
    title: "Nội dung truyền thông · EB V2",
    steps: ["Tiếp nhận brief", "Tạo bài", "Chuyển thể theo kênh", "Duyệt"],
    articles: "Bài EB V2 đã có nội dung",
  },
}
const formatLabels = { facebook: "Facebook", linkedin: "LinkedIn", threads: "Threads" }

function profileValue({ value, format, unit }) {
  if (value === null) return "Chưa có dữ liệu"
  const shown = format === "text" ? value
    : format === "percent" ? new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 }).format(value / 100)
    : format === "duration" ? duration(value)
    : format === "minutes" ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value) + " phút"
    : number(value)
  return unit ? shown + " " + unit : shown
}

function ProfileMetrics({ metrics, className = "perf-main-job-metrics" }) {
  return (
    <dl className={className}>
      {metrics.map((m) => (
        <div key={m.label}>
          <dt>{m.label}</dt>
          <dd>{m.tone ? <Signal tone={m.tone}>{profileValue(m)}</Signal> : profileValue(m)}</dd>
          {m.note && <small>{m.note}</small>}
        </div>
      ))}
    </dl>
  )
}

// Main job described by the app itself (profile-v1).
function ProfileMainJob({ job }) {
  return (
    <article className="perf-card perf-main-job">
      <div className="perf-card-heading">
        <div>
          <h2>Main job</h2>
          <p>{job.title}</p>
        </div>
        <GitBranch size={18} aria-hidden="true" />
      </div>
      {job.steps.length > 0 && (
        <ol className="perf-main-job-steps" aria-label="Các bước thực hiện">
          {job.steps.map((step, index) => (
            <li key={step + index}><span aria-hidden="true">{index + 1}</span>{step}</li>
          ))}
        </ol>
      )}
      {job.metrics.length > 0 && <ProfileMetrics metrics={job.metrics} />}
      {job.note && <p className="perf-footnote">{job.note}</p>}
    </article>
  )
}

// App-specific cards: each connected app decides what belongs to it.
function AppSections({ sections }) {
  if (!sections.length) return null
  return (
    <div className="perf-app-sections">
      {sections.map((section) => (
        <article className="perf-card perf-app-section" key={section.id}>
          <div className="perf-card-heading">
            <div>
              <h2>{section.title}</h2>
              {section.description && <p>{section.description}</p>}
            </div>
          </div>
          {section.metrics.length > 0 && <ProfileMetrics metrics={section.metrics} className="perf-main-job-metrics perf-app-metrics" />}
          {section.table && (
            <div className="perf-table-scroll">
              <table>
                <thead><tr>{section.table.columns.map((c) => <th scope="col" key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {section.table.rows.length ? section.table.rows.map((row, i) => (
                    <tr key={i}>{row.map((cell, j) => j === 0
                      ? <th scope="row" key={j}>{cell ?? "—"}</th>
                      : <td key={j}>{cell == null ? "—" : typeof cell === "number" ? number(cell) : cell}</td>)}</tr>
                  )) : <tr><td colSpan={section.table.columns.length}>Chưa có dữ liệu.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

function MainJob({ workload }) {
  const labels = workloadLabels[workload?.kind]
  return (
    <article className="perf-card perf-main-job">
      <div className="perf-card-heading">
        <div>
          <h2>Main job</h2>
          <p>{labels?.title || "Chưa có thông tin về quy trình chính."}</p>
        </div>
        <GitBranch size={18} aria-hidden="true" />
      </div>
      {!labels ? <p className="perf-footnote">Chưa có dữ liệu khối lượng công việc từ ứng dụng.</p> : <>
        <ol className="perf-main-job-steps" aria-label="Các bước thực hiện">
          {labels.steps.map((step, index) => (
            <li key={step}><span aria-hidden="true">{index + 1}</span>{step}</li>
          ))}
        </ol>
        <dl className="perf-main-job-metrics">
          <div><dt>{labels.articles}</dt><dd>{number(workload.articles)}</dd></div>
          <div>
            <dt>Độ dài trung bình</dt>
            <dd>{show(workload.averageWords, (value) => number(value) + " từ")}</dd>
          </div>
          {workload.lengthSamples > 0 && (
            <div>
              <dt>Khoảng độ dài · {number(workload.lengthSamples)} mẫu</dt>
              <dd>{number(workload.minWords)}–{number(workload.maxWords)} từ</dd>
            </div>
          )}
        </dl>
        {Array.isArray(workload.formats) && (
          <div className="perf-table-scroll">
            <table>
              <thead><tr><th scope="col">Format / kênh</th><th scope="col">Số nội dung</th><th scope="col">Độ dài trung bình</th><th scope="col">Khoảng độ dài</th></tr></thead>
              <tbody>
                {workload.formats.length ? workload.formats.map((row) => (
                  <tr key={row.format}>
                    <th scope="row">{formatLabels[row.format] || row.format}</th>
                    <td>{number(row.outputs)}</td>
                    <td>{number(row.averageWords)} từ</td>
                    <td>{number(row.minWords)}–{number(row.maxWords)} từ</td>
                  </tr>
                )) : <tr><td colSpan={4}>Chưa có nội dung theo kênh.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="perf-footnote">Số liệu từ nội dung đã lưu. Độ dài tính theo từ phân tách bằng khoảng trắng.</p>
      </>}
    </article>
  )
}

function RuntimeReport({ target: t, days }) {
  const profile = appProfile(t.report?.profile)
  const r = t.report,
    http = r?.http,
    ai = r?.ai,
    rt = r?.runtime
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
          <ProjectPerformanceTargets report={r} profile={profile} />
          {http && <RuntimeOverview report={r} />}
          <div className="perf-grid">
            {profile?.mainJob ? <ProfileMainJob job={profile.mainJob} /> : <MainJob workload={r.contentWorkload} />}
            {rt && <article className="perf-card perf-system-card">
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
                  ["HTTP / AI đang xử lý", (http?.inFlight ?? "—") + " / " + (ai?.inFlight ?? "—")],
                  ["Runtime", rt.runtimeVersion || (rt.nodeVersion ? "Node.js " + rt.nodeVersion : "Chưa xác định")],
                  ["Commit", rt.commit?.slice(0, 12) || "Chưa xác định"],
                  ["Tiến trình bắt đầu", timestamp(rt.startedAt)],
                  ["Database round trip", show(r.database?.responseMs, duration)],
                  ["Pool tổng / rảnh / chờ", [r.database?.poolTotal, r.database?.poolIdle, r.database?.poolWaiting].map((value) => value ?? "—").join(" / ")],
                  ["App → Lab", duration(t.fetchMs) + " · gồm truy vấn monitoring"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>}
          </div>
          <AppSections sections={profile?.sections || []} />
          {ai && <AICharts report={r} />}
          {r.inventory && <WorkflowStatus inventory={r.inventory} labels={profile?.inventoryLabels} />}
          {(http || ai) && <details className="rc-details">
            <summary>Xem bảng số liệu chi tiết · AI và HTTP</summary>
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
                    {(ai?.models || []).map((m) => (
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
              {!ai?.models?.length && (
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
                        "Lượt đã lưu / cache hits",
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
                          {m.source ? m.source + " · " : ""}
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
                    {(http?.routes || []).map((v) => (
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
          </details>}
          <p className="perf-footnote">
            Cập nhật {timestamp(r.generatedAt)} · bắt đầu có mẫu{" "}
            {timestamp(r.coverage?.firstMeasuredHour)} · P50/P95/P99 là cận trên
            histogram. AI calls là lượt qua dispatcher, không bao gồm từng retry
            nội bộ SDK. Chi phí tính theo giá model được cấu hình, chưa phải hóa
            đơn provider. Số liệu có thể mất tối đa 5 giây khi tiến trình dừng
            đột ngột.
          </p>
          {r.coverage && (!r.coverage.complete || r.coverage.recordingErrors > 0) && (
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
        if (!cancelled) setError(e.message);
        throw e;
      } finally {
        inFlight = false
        if (!cancelled) setBusy(false)
      }
    }
    const polling = startPolling(load,{interval:()=>60000});
    return () => {
      cancelled = true;
      polling.stop();
    };
  }, [days, refresh, reportProject]);
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
            {scope === "lab" && <ActivePill group="perf-scope" />}
            <Server size={15} />
            AI Agent Lab
          </button>
          <button
            aria-pressed={scope === "projects"}
            onClick={() => setScope("projects")}
          >
            {scope === "projects" && <ActivePill group="perf-scope" />}
            <GitBranch size={15} />
            Projects
          </button>
        </div>
        <small>
          {data
            ? "Cập nhật " +
              timestamp(data.generatedAt) +
              " · Tự làm mới 60 giây"
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
              <ConnectionMap projects={data.projects} runner={lab.runner} />
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
              <TaskUsage report={data} lab/>
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
