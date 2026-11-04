import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Server,
  GitBranch,
  Clock,
  CheckCircle2,
} from "lucide-react";
import "./performance.css";

const number = (value) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
const timestamp = (value) =>
  value ? new Date(value).toLocaleString("vi-VN") : "Chưa có tín hiệu";
const duration = (ms) =>
  ms == null
    ? "—"
    : ms < 1000
      ? number(ms) + " ms"
      : ms < 60000
        ? number(ms / 1000) + " giây"
        : number(ms / 60000) + " phút";
const connectionLabels = {
  ready: "Sẵn sàng",
  stale: "Tín hiệu quá hạn",
  error: "Lỗi checkout",
  unknown: "Chưa có tín hiệu",
  paused: "Đã tạm dừng",
  disabled: "Runner chưa bật",
};
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
};
function Signal({ tone = "neutral", children }) {
  return (
    <span className={"perf-signal " + tone}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}
function PerformanceSelect({ children, ...props }) {
  return (
    <span className="perf-select">
      <select {...props}>{children}</select>
    </span>
  );
}
const count = (value) => number(Math.round(value));
const percentage = (value) => number(value) + "%";
function AnimatedValue({ value, format = count }) {
  const current = useRef(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame;
    const finish = () => {
      cancelAnimationFrame(frame);
      current.current = value;
      setDisplay(value);
    };
    const from = current.current ?? 0;
    if (value == null || motion.matches || from === value) {
      finish();
    } else {
      const started = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / 650);
        const next = from + (value - from) * (1 - Math.pow(1 - progress, 3));
        current.current = next;
        setDisplay(next);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    const onMotion = () => {
      if (motion.matches) finish();
    };
    motion.addEventListener("change", onMotion);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", onMotion);
    };
  }, [value]);
  return (
    <>
      <span aria-hidden="true">
        {value == null ? "—" : format(display ?? 0)}
      </span>
      <span className="sr-only">{value == null ? "—" : format(value)}</span>
    </>
  );
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
  );
}

function ProjectReport({ project: p, runner }) {
  const stages = [
    { label: "Feedback", value: p.total, detail: "Được tạo trong kỳ" },
    { label: "Nghiệm thu", value: p.completed, detail: "Đã chấp nhận kết quả" },
    { label: "Deploy", value: p.deployed, detail: "Lab xác nhận thành công" },
  ];
  const connectionTone =
    p.connection === "ready"
      ? "success"
      : ["error", "stale"].includes(p.connection)
        ? "warning"
        : "neutral";
  return (
    <section
      className="perf-project-report"
      aria-labelledby={"project-report-" + p.id}
    >
      <header className="perf-project-heading">
        <div>
          <span className="eyebrow">PROJECT REPORT</span>
          <h2 id={"project-report-" + p.id}>{p.name}</h2>
          <p className="perf-repository">{p.repository}</p>
        </div>
        <Signal tone={connectionTone}>{connectionLabels[p.connection]}</Signal>
      </header>
      <div className="perf-metrics">
        <Metric
          icon={GitBranch}
          label="Feedback trong kỳ"
          value={p.total}
          surface="blue"
        />
        <Metric
          icon={CheckCircle2}
          label="Đã nghiệm thu"
          value={p.completed}
          surface="lime"
        />
        <Metric
          icon={ArrowUpRight}
          label="Đã deploy"
          value={p.deployed}
          surface="yellow"
        />
        <Metric
          icon={Clock}
          label="P95 tới deploy"
          value={p.p95DeliveryMs}
          format={duration}
          surface="ink"
          note={p.deliverySamples + " mẫu · gồm thời gian chờ và xử lý"}
        />
      </div>
      <div className="perf-grid">
        <article className="perf-card perf-trend-card perf-delivery-flow">
          <div className="perf-card-heading">
            <div>
              <h2>Luồng bàn giao</h2>
              <p>Kết quả tích lũy của nhóm feedback được tạo trong kỳ</p>
            </div>
            <GitBranch size={18} aria-hidden="true" />
          </div>
          <ol className="perf-flow" aria-label={"Luồng bàn giao của " + p.name}>
            {stages.map((stage, index) => (
              <li key={stage.label}>
                <span className="perf-flow-step">0{index + 1}</span>
                <strong>
                  <AnimatedValue value={stage.value} />
                </strong>
                <h3>{stage.label}</h3>
                <small>{stage.detail}</small>
                {index < stages.length - 1 && (
                  <ArrowRight
                    className="perf-flow-arrow"
                    size={20}
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
          <p className="perf-footnote">
            Thời lượng tính tới mốc deployedAt đã lưu.{" "}
            {p.missingDeploymentTimes > 0
              ? p.missingDeploymentTimes +
                " request thiếu mốc deploy được loại khỏi mẫu P95."
              : p.deliverySamples
                ? "Các mẫu thời gian hiện có đã được ghi nhận."
                : "Chưa có mẫu thời gian deploy trong kỳ."}
          </p>
        </article>
        <article className="perf-card perf-system-card">
          <div className="perf-card-heading">
            <div>
              <h2>Kết nối & vận hành</h2>
              <p>Tín hiệu mới nhất của runner và checkout</p>
            </div>
            <Server size={18} aria-hidden="true" />
          </div>
          <ol
            className="perf-connection-flow"
            aria-label={"Kết nối vận hành của " + p.name}
          >
            <li>
              <Server size={18} aria-hidden="true" />
              <strong>Agent Lab</strong>
              <Signal tone="success">Đang phản hồi</Signal>
            </li>
            <li>
              <Activity size={18} aria-hidden="true" />
              <strong>Mac runner</strong>
              <Signal tone={runner.connected ? "success" : "warning"}>
                {runner.connected ? "Đã kết nối" : "Chưa có tín hiệu mới"}
              </Signal>
            </li>
            <li>
              <GitBranch size={18} aria-hidden="true" />
              <strong>Checkout</strong>
              <Signal tone={connectionTone}>
                {connectionLabels[p.connection]}
              </Signal>
            </li>
          </ol>
          <div className="perf-project-numbers">
            <div>
              <strong>
                <AnimatedValue value={p.active} />
              </strong>
              <small>Đang vận hành</small>
            </div>
            <div>
              <strong data-tone={p.blocked ? "warning" : "neutral"}>
                <AnimatedValue value={p.blocked} />
              </strong>
              <small>Chờ lượt</small>
            </div>
            <div>
              <strong data-tone={p.attention ? "error" : "neutral"}>
                <AnimatedValue value={p.attention} />
              </strong>
              <small>Cần xử lý</small>
            </div>
          </div>
          <dl className="perf-health">
            <div>
              <dt>Đang xử lý</dt>
              <dd>{p.running} request</dd>
            </div>
            <div>
              <dt>Heartbeat runner</dt>
              <dd>{timestamp(p.lastSeenAt)}</dd>
            </div>
            <div>
              <dt>Phát hành gần nhất</dt>
              <dd>
                {p.latestRelease ? (
                  <>
                    {statusLabels[p.latestRelease.phase] ||
                      p.latestRelease.phase}
                    <br />
                    <small>{timestamp(p.latestRelease.at)}</small>
                  </>
                ) : (
                  "Chưa có phát hành"
                )}
              </dd>
            </div>
            <div>
              <dt>Runtime app</dt>
              <dd>Chưa có dữ liệu runtime</dd>
            </div>
          </dl>
          <p className="perf-footnote">
            Số liệu hàng đợi phản ánh trạng thái hiện tại. Runtime app cần
            health check riêng sau deploy.
          </p>
        </article>
      </div>
    </section>
  );
}

export default function Performance({ api, onRequest }) {
  const [days, setDays] = useState(7),
    [scope, setScope] = useState("lab"),
    [projectId, setProjectId] = useState("all");
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const reportProject = scope === "projects" ? projectId : "all";
  useEffect(() => {
    setData(null);
  }, [days, reportProject]);
  useEffect(() => {
    let cancelled = false,
      inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      setBusy(true);
      try {
        const next = await api(
          "/performance?days=" +
            days +
            (reportProject === "all"
              ? ""
              : "&projectId=" + encodeURIComponent(reportProject)),
        );
        if (!cancelled) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        inFlight = false;
        if (!cancelled) setBusy(false);
      }
    }
    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [days, refresh, reportProject]);
  const projects =
    data?.projects.filter((p) => projectId === "all" || p.id === projectId) ||
    [];
  const recent =
    data?.recent.filter(
      (r) => projectId === "all" || r.projectId === projectId,
    ) || [];
  const summary = data?.summary,
    lab = data?.lab;
  const maximum = Math.max(1, ...(data?.trend.map((v) => v.created) || []));
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
              <div className="perf-metrics">
                <Metric
                  icon={Activity}
                  label="Lượt gọi API"
                  tone={lab.http.calls ? "info" : "neutral"}
                  value={lab.http.calls}
                  surface="blue"
                  note="HTTP tới API, runner và MCP"
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
            <>
              <div className="perf-section-heading">
                <div>
                  <h2>Hoạt động theo project</h2>
                  <p>
                    Hàng đợi hiện tại và kết quả của feedback được tạo trong kỳ.
                  </p>
                </div>
                <PerformanceSelect
                  aria-label="Lọc project báo cáo"
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
              {!projects.length ? (
                <div className="perf-card perf-empty">
                  Chưa có project để báo cáo. Kết nối repository trong Cài đặt
                  để bắt đầu.
                </div>
              ) : (
                <div className="perf-project-reports">
                  {projects.map((p) => (
                    <ProjectReport key={p.id} project={p} runner={lab.runner} />
                  ))}
                </div>
              )}
            </>
          )}
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
                          {statusLabels[r.releasePhase || r.status] || r.status}
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
            theo ngày tạo feedback, trạng thái phản ánh lần cập nhật mới nhất.
            Biểu đồ theo UTC, thời điểm hiển thị theo múi giờ thiết bị. Thời
            lượng deploy tính tới lúc Lab xác nhận thành công; request thiếu mốc
            thời gian được loại khỏi mẫu P95.
          </p>
        </div>
      )}
    </section>
  );
}
