import React, { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  RefreshCw,
  Server,
  GitBranch,
  Clock,
  CheckCircle2,
  ChevronDown,
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
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  );
}
function Metric({ icon: Icon, label, value, note, tone = "neutral" }) {
  return (
    <article className="perf-card perf-metric" data-tone={tone}>
      <div className="perf-card-label">
        <Icon size={16} aria-hidden="true" />
        {label}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
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
          Đang tải báo cáo vận hành…
        </div>
      )}
      {data && (
        <>
          {scope === "lab" ? (
            <>
              <div className="perf-metrics">
                <Metric
                  icon={Activity}
                  label="Lượt gọi API"
                  tone={lab.http.calls ? "info" : "neutral"}
                  value={number(lab.http.calls)}
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
                  value={
                    lab.http.calls
                      ? number(
                          (100 * (lab.http.calls - lab.http.errors)) /
                            lab.http.calls,
                        ) + "%"
                      : "—"
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
                  value={duration(lab.http.averageMs)}
                  note={"Cao nhất " + duration(lab.http.maxMs)}
                />
                <Metric
                  icon={GitBranch}
                  label="Đang vận hành"
                  tone={lab.active ? "info" : "neutral"}
                  value={number(lab.active)}
                  note={
                    number(lab.running) + " request đang xử lý · toàn thời gian"
                  }
                />
              </div>
              <div className="perf-grid">
                <article className="perf-card">
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
                <article className="perf-card">
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
                  note="Trạng thái phát hành được Lab ghi nhận"
                />
                <Metric
                  icon={Clock}
                  label="P95 thời gian tới deploy"
                  tone={summary.deliverySamples ? "info" : "neutral"}
                  value={duration(summary.p95DeliveryMs)}
                  note={
                    summary.deliverySamples +
                    " mẫu · gồm thời gian chờ và xử lý"
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
                <div className="perf-project-grid">
                  {projects.map((p) => (
                    <article className="perf-card" key={p.id}>
                      <div className="perf-card-heading">
                        <div>
                          <h2>{p.name}</h2>
                          <p className="perf-repository">{p.repository}</p>
                        </div>
                        <GitBranch size={18} />
                      </div>
                      <Signal
                        tone={
                          p.connection === "ready"
                            ? "success"
                            : ["error", "stale"].includes(p.connection)
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {connectionLabels[p.connection]}
                      </Signal>
                      <div className="perf-project-numbers">
                        <div>
                          <strong data-tone={p.active ? "info" : "neutral"}>
                            {p.active}
                          </strong>
                          <small>Đang vận hành</small>
                        </div>
                        <div>
                          <strong data-tone={p.blocked ? "warning" : "neutral"}>
                            {p.blocked}
                          </strong>
                          <small>Chờ lượt</small>
                        </div>
                        <div>
                          <strong data-tone={p.attention ? "error" : "neutral"}>
                            {p.attention}
                          </strong>
                          <small>Cần xử lý</small>
                        </div>
                      </div>
                      <dl className="perf-health">
                        <div>
                          <dt>Feedback trong kỳ</dt>
                          <dd>{p.total}</dd>
                        </div>
                        <div>
                          <dt>Đã nghiệm thu / deploy</dt>
                          <dd>
                            {p.completed} / {p.deployed}
                          </dd>
                        </div>
                        <div>
                          <dt>P95 tới deploy</dt>
                          <dd>
                            {duration(p.p95DeliveryMs)} · {p.deliverySamples}{" "}
                            mẫu
                          </dd>
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
                          <dt>Tín hiệu runner</dt>
                          <dd>{timestamp(p.lastSeenAt)}</dd>
                        </div>
                        <div>
                          <dt>Runtime app</dt>
                          <dd>Chưa có dữ liệu runtime</dd>
                        </div>
                      </dl>
                      <p className="perf-footnote">
                        Trạng thái checkout dựa trên heartbeat runner. Runtime
                        cần health check riêng của app sau deploy.
                      </p>
                    </article>
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
            Biểu đồ theo UTC, thời điểm hiển thị theo múi giờ thiết bị.
          </p>
        </>
      )}
    </section>
  );
}
