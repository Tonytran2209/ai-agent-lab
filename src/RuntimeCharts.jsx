import ProjectUsageTimeline, { usageSources } from "./ProjectUsageTimeline.jsx"
import LatencyChart from "./LatencyChart.jsx"
import React from "react"
import AnimatedValue from "./AnimatedValue.jsx"
import {
  modelSeries,
  hourlySeries,
  responseShare,
  statusTone,
} from "./runtime-chart-data.js"
import "./runtime-charts.css"
const n = (v) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v)
const usd = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(v)
const ms = (v) =>
  v == null ? "—" : v >= 1000 ? n(v / 1000) + " s" : n(v) + " ms"
const empty = <p className="rc-empty">Chưa có mẫu trong kỳ này.</p>
function Title({ eyebrow, title, detail }) {
  return (
    <header className="rc-heading">
      <span>{eyebrow}</span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
    </header>
  )
}
function Legend({ items }) {
  return (
    <ul className="rc-legend">
      {items.map((v) => (
        <li key={v.label}>
          <i style={{ background: v.color }} />
          {v.label}
        </li>
      ))}
    </ul>
  )
}
export function RuntimeOverview({ report: r }) {
  const h = r.http,
    share = responseShare(h),
    points = hourlySeries(r.timeline),
    max = Math.max(1, ...points.map((v) => v.calls))
  const statuses = r.articles?.byStatus || [],
    total = r.articles?.total
  return (
    <div className="rc-bento">
      <article className="rc-card rc-lime rc-success">
        <Title eyebrow="HTTP HEALTH" title="Phản hồi không lỗi 5xx" />
        <svg
          viewBox="0 0 240 150"
          className="rc-gauge"
          role="img"
          aria-label={
            share == null
              ? "Chưa có request hoàn tất"
              : n(share) + "% phản hồi không lỗi 5xx"
          }
        >
          <path
            d="M25 125 A95 95 0 0 1 215 125"
            className="rc-gauge-track"
            pathLength="100"
          />
          <path
            d="M25 125 A95 95 0 0 1 215 125"
            className="rc-gauge-fill"
            pathLength="100"
            strokeDasharray={`${share ?? 0} 100`}
          />
        </svg>
        <strong className="rc-gauge-value">
          <AnimatedValue value={share} format={(v) => n(v) + "%"} />
        </strong>
        <p>
          {n(h.failed)} lỗi 5xx · {n(h.clientErrors)} phản hồi 4xx ·{" "}
          {n(h.aborted || 0)} hủy
        </p>
        <small>4xx vẫn được tính là phản hồi không lỗi máy chủ.</small>
      </article>
      <article className="rc-card rc-ink rc-content">
        <Title
          eyebrow="CONTENT INVENTORY"
          title="Kho bài viết"
          detail="Trạng thái hiện tại · phiên bản mới nhất"
        />
        <strong className="rc-number">
          <AnimatedValue value={total ?? null} />
        </strong>
        {total > 0 ? (
          <>
            <div
              className="rc-content-strip"
              role="img"
              aria-label={statuses
                .map((v) => v.status + ": " + v.count)
                .join(", ")}
            >
              {statuses.map((v) => (
                <span
                  key={v.status}
                  className={"rc-status-" + statusTone(v.status)}
                  style={{ flexGrow: v.count }}
                  title={v.status + ": " + n(v.count)}
                />
              ))}
            </div>
            <ul className="rc-content-list">
              {statuses.map((v) => (
                <li key={v.status}>
                  <i className={"rc-status-" + statusTone(v.status)} />
                  <span>{v.status}</span>
                  <b>{n(v.count)}</b>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="rc-empty">
            {total === 0
              ? "Kho hiện tại chưa có bài viết."
              : "Chưa đọc được kho bài viết."}
          </p>
        )}
        <small>
          {r.plans?.total == null
            ? "Chưa có số liệu content plan"
            : n(r.plans.total) + " content plan trong bảng quan hệ"}
        </small>
      </article>
      <article className="rc-card rc-orange rc-traffic">
        <Title
          eyebrow="TRAFFIC / UTC"
          title="Lưu lượng theo giờ"
          detail="Chỉ các giờ đã ghi nhận · khoảng trống không phải số 0"
        />
        <strong className="rc-number">
          <AnimatedValue value={h.calls} />
          <small>HTTP requests</small>
        </strong>
        {points.length ? (
          <>
            <div className="rc-traffic-scroll">
              <div
                className="rc-traffic-bars"
                style={{ minWidth: Math.max(280, points.length * 36) }}
                role="img"
                aria-label={points
                  .map(
                    (v) =>
                      v.hour +
                      ": " +
                      v.calls +
                      " requests, " +
                      v.errors +
                      " lỗi 5xx",
                  )
                  .join("; ")}
              >
                {points.map((v, i) => {
                  const gap =
                    i > 0 &&
                    Date.parse(v.hour) - Date.parse(points[i - 1].hour) >
                      3600000
                  return (
                    <div
                      className={
                        "rc-traffic-column" + (gap ? " rc-observation-gap" : "")
                      }
                      key={v.hour}
                    >
                      <span>{n(v.calls)}</span>
                      <div className="rc-traffic-track">
                        <div
                          className="rc-traffic-fill"
                          style={{
                            height: (v.calls / max) * 100 + "%",
                            "--rc-i": Math.min(i, 12),
                          }}
                          title={
                            v.hour +
                            " · " +
                            v.calls +
                            " requests · " +
                            v.errors +
                            " lỗi"
                          }
                        >
                          <i
                            style={{
                              height: v.calls
                                ? (v.errors / v.calls) * 100 + "%"
                                : "0%",
                            }}
                          />
                        </div>
                      </div>
                      <small>
                        {v.hour.slice(8, 10) + "/" + v.hour.slice(11, 13) + "h"}
                      </small>
                    </div>
                  )
                })}
              </div>
            </div>
            <Legend
              items={[
                { label: "HTTP requests", color: "#242522" },
                { label: "Trong đó lỗi 5xx", color: "#7e1d22" },
              ]}
            />
          </>
        ) : (
          empty
        )}
      </article>
      <article className="rc-card rc-latency">
        <h3 className="rc-latency-title">Thời gian phản hồi HTTP</h3>
        {h.calls ? <LatencyChart http={h} /> : empty}
        {h.calls > 0 && (
          <small className="rc-latency-note">
            Dựa trên {n(h.calls)} yêu cầu trong kỳ. Các mốc thời gian là ước tính.
          </small>
        )}
      </article>
    </div>
  )
}
export function AICharts({ report: r }) {
  return (
    <section className="rc-ai-section">
      <div className="perf-section-heading">
        <div>
          <h2>Mức sử dụng AI của dự án</h2>
          <p>Một lượt gọi có thể xuất hiện ở cả hai nguồn. Số liệu được trình bày theo nguồn để tránh tính trùng.</p>
        </div>
      </div>
      <ProjectUsageTimeline report={r} />
      {r.ai.calls > 0 && (
        <div className="rc-ai-facts">
          <span>
            Lượt gọi AI trực tiếp <b>{n(r.ai.calls)}</b> · {n(r.ai.failed)} lỗi
          </span>
          <span>
            Phản hồi TB <b>{ms(r.ai.averageMs)}</b> · P95 {ms(r.ai.p95Ms)}
          </span>
          <span>
            {n(r.ai.usageSamples)} / {n(r.ai.calls)} lượt có token usage
          </span>
        </div>
      )}
      {usageSources.map(({ id, label }) => (
        <details className="rc-details" key={id}>
          <summary>{label} · Chi tiết theo model</summary>
          <AIModelCharts report={r} source={id} />
        </details>
      ))}
    </section>
  )
}

function AIModelCharts({ report, source }) {
  const series = modelSeries(report, source)
  const max = Math.max(1, ...series.map((v) => v.total))
  const priced = series.filter((v) => v.cost !== null)
  const costMax = Math.max(...priced.map((v) => v.cost), 0)
  const total = series.reduce((s, v) => s + v.total, 0)
  const known = priced.reduce((s, v) => s + v.cost, 0)
  return (
    <div className="rc-ai-grid">
      <article className="rc-card rc-ink">
        <Title eyebrow="TOKEN MIX" title="Token theo model" />
        <strong className="rc-number">
          <AnimatedValue value={series.length ? total : null} />
          <small>input + output tokens</small>
        </strong>
        <Legend
          items={[
            { label: "Input không cache", color: "#ceff62" },
            { label: "Cached input", color: "#9ab9ff" },
            { label: "Output", color: "#ffed87" },
          ]}
        />
        {series.length ? (
          <div className="rc-models">
            {series.map((v) => (
              <div className="rc-model" key={v.id}>
                <div>
                  <span>{v.id}</span>
                  <small>{n(v.total)} tokens</small>
                </div>
                <div
                  className="rc-token-track"
                  role="img"
                  aria-label={`${v.id}: ${n(v.input - v.cached)} input không cache, ${n(v.cached)} cached input, ${n(v.output)} output`}
                >
                  <div style={{ width: (v.total / max) * 100 + "%" }}>
                    {[
                      [v.input - v.cached, "#ceff62"],
                      [v.cached, "#9ab9ff"],
                      [v.output, "#ffed87"],
                    ].map(([value, color], i) => (
                      <i
                        key={i}
                        style={{ flexGrow: value, background: color }}
                      />
                    ))}
                  </div>
                </div>
                <small>
                  {n(v.input)} input · {n(v.cached)} cached (nằm trong input)
                  · {n(v.output)} output
                </small>
              </div>
            ))}
          </div>
        ) : (
          empty
        )}
      </article>
      <article className="rc-card rc-blue">
        <Title
          eyebrow="COST / USD"
          title="Chi phí đã định giá"
          detail="Ước tính theo giá cấu hình · không phải hóa đơn"
        />
        <strong className="rc-number">
          <AnimatedValue value={priced.length ? known : null} format={usd} />
        </strong>
        {priced.length > 0 && (
          <p className="rc-cost-average">
            {series.reduce((s, v) => s + v.priced, 0) > 0
              ? "TB / lượt có giá: " +
                usd(known / series.reduce((s, v) => s + v.priced, 0))
              : "Chưa có mẫu tính chi phí trung bình."}
          </p>
        )}
        {priced.length ? (
          <ol className="rc-costs">
            {[...priced]
              .sort((a, b) => b.cost - a.cost)
              .map((v) => (
                <li key={v.id}>
                  <div>
                    <span>{v.id}</span>
                    <strong>{usd(v.cost)}</strong>
                  </div>
                  <div className="rc-cost-track">
                    <span
                      style={{
                        width: (costMax ? (v.cost / costMax) * 100 : 0) + "%",
                      }}
                    />
                  </div>
                  <small>
                    {n(v.priced)} / {n(v.calls)} lượt đã định giá
                  </small>
                </li>
              ))}
          </ol>
        ) : (
          <p className="rc-empty">
            Chưa có chi phí được định giá cho nguồn này.
          </p>
        )}
        {series.some((v) => v.cost === null) && (
          <p className="rc-price-missing">
            {series.filter((v) => v.cost === null).length} model chưa có giá ·
            không coi chi phí thiếu là $0.
          </p>
        )}
      </article>
    </div>

)
}
const names = {
content_plan_items: "Hạng mục content plan",
article_stage_runs: "Lượt chạy từng giai đoạn",
batch_jobs: "Batch jobs",
batch_job_items: "Hạng mục batch",
quality_gate_runs: "Quality gates",
editorial_approvals: "Phê duyệt biên tập",
website_content_inventory: "Kho website",
eb_v2_packages: "EB V2 · Packages",
eb_v2_gate_runs: "EB V2 · Gate runs",
eb_v2_feedback_threads: "EB V2 · Feedback",
eb_v2_library_documents: "EB V2 · Thư viện",
eb_v2_discovery_items: "EB V2 · Discovery",
eb_v2_channel_outputs: "EB V2 · Output mới nhất theo kênh",
}
export function WorkflowStatus({ inventory }) {
  return (
    <article className="rc-card rc-workflow">
      <Title
        eyebrow="WORKFLOW SNAPSHOT"
        title="Hàng đợi & chất lượng"
        detail="Mỗi hàng có thang riêng · độ dài thể hiện tỷ trọng trạng thái, không so tổng giữa các hàng"
      />
      <div className="rc-workflow-rows">
        {Object.entries(inventory || {}).map(([key, rows]) => {
          const total = rows?.reduce((s, v) => s + v.count, 0)
          return (
            <div className="rc-workflow-row" key={key}>
              <div>
                <strong>{names[key] || key}</strong>
                <span>
                  {rows === null ? "Chưa có dữ liệu" : n(total) + " bản ghi"}
                </span>
              </div>
              {total > 0 ? (
                <>
                  <div
                    className="rc-workflow-track"
                    role="img"
                    aria-label={rows
                      .map((v) => v.status + ": " + v.count)
                      .join(", ")}
                  >
                    {rows.map((v) => (
                      <span
                        key={v.status}
                        className={"rc-status-" + statusTone(v.status)}
                        style={{ flexGrow: v.count }}
                        title={v.status + ": " + v.count}
                      />
                    ))}
                  </div>
                  <div className="rc-workflow-labels">
                    {rows.map((v) => (
                      <span key={v.status}>
                        <i className={"rc-status-" + statusTone(v.status)} />
                        {v.status} <b>{n(v.count)}</b>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <small>
                  {rows === null
                    ? "Chưa đọc được bảng tương ứng."
                    : "Chưa có bản ghi."}
                </small>
              )}
            </div>
          )
        })}
      </div>
    </article>
  )
}
