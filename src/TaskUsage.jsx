import React, { useState } from "react"
import AnimatedValue from "./AnimatedValue.jsx"
import { taskRows, taskSummary, rankedTasks, taskTimeline } from "./task-usage-data.js"
import "./task-usage.css"
const n = (v) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v)
const usd = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(v)
const status = {
  completed: "Hoàn tất",
  running: "Đang chạy",
  failed: "Thất bại",
  interrupted: "Gián đoạn",
  unattributed: "Chưa gắn được task",
}
const value = (v, f = n) => (v == null ? "—" : f(v))
const utcDate = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", timeZone: "UTC",
})
const utcHour = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit", minute: "2-digit", timeZone: "UTC",
})
const dots = 16

function TaskTimeline({ rows, report }) {
  const [metric, setMetric] = useState("tokens")
  const periods = taskTimeline(rows, report)
  if (!periods.some((period) => period.count)) return null
  const tokens = metric === "tokens"
  const format = tokens ? n : usd
  const maximum = Math.max(...periods.map((period) => period[metric] ?? 0))
  const hourly = (report.window?.days ?? report.days) === 1

  return (
    <figure className="rc-card task-timeline" data-metric={metric}>
      <div className="task-timeline-heading">
        <div>
          <h3>Mức tiêu thụ theo thời gian</h3>
          <p>Tổng đã ghi nhận, nhóm theo thời điểm task bắt đầu (UTC).</p>
        </div>
        <div className="task-timeline-switch" aria-label="Chỉ số tiêu thụ" role="group">
          <button type="button" aria-pressed={tokens} onClick={() => setMetric("tokens")}>Token</button>
          <button type="button" aria-pressed={!tokens} onClick={() => setMetric("usd")}>USD</button>
        </div>
      </div>
      <ol className="task-periods">
        {periods.map((period) => {
          const amount = period[metric]
          const filled = amount > 0 ? Math.max(1, Math.round(amount / maximum * dots)) : 0
          const start = (hourly ? utcHour : utcDate).format(period.start)
          const end = utcDate.format(period.end)
          const label = hourly || start === end ? start : start + "–" + end
          const partial = amount != null && (tokens ? period.partialTokens : period.partialUsd)
          return (
            <li key={period.start}>
              <span className="task-period-value">
                {amount == null ? (period.count ? "Chưa rõ" : "—") : format(amount)}
                {partial && <abbr title="Số liệu chưa đầy đủ">*</abbr>}
              </span>
              <span className="task-dots" aria-hidden="true">
                {Array.from({ length: dots }, (_, i) => (
                  <i key={i} data-filled={i >= dots - filled} />
                ))}
              </span>
              <span>{label}</span>
            </li>
          )
        })}
      </ol>
      <figcaption>Chấm đầy tương ứng mốc cao nhất trong kỳ. Dấu — là không có task; * là số liệu chưa đầy đủ.{!tokens && " USD là chi phí ước tính."}</figcaption>
    </figure>
  )
}

export default function TaskUsage({ report, lab = false }) {
  const [source, setSource] = useState(
      report.taskUsage?.rows?.length
        ? "current"
        : report.historicalTasks?.length
          ? "historical"
          : "current",
    ),
    [sort, setSort] = useState("cost"),
    [threshold, setThreshold] = useState(""),
    [limit, setLimit] = useState(20)
  const rows = taskRows(report, source === "historical"),
    summary = taskSummary(rows),
    budget = Number(threshold) > 0 ? Number(threshold) : null,
    ranked = rankedTasks(rows, sort),
    over = budget
      ? rows.filter((r) => r.knownCostUsd != null && r.knownCostUsd > budget)
      : []
  return (
    <section className="task-usage">
      <div className="perf-section-heading">
        <div>
          <span className="eyebrow">TASK CONSUMPTION</span>
          <h2>Token & USD trên mỗi task</h2>
          <p>
            {lab
              ? "Một request/feedback · chỉ API Lab đã ghi nhận, chưa gồm Codex CLI/ChatGPT."
              : source === "historical"
                ? "Một giai đoạn đã lưu · chỉ usage cuối, có thể thiếu retry/cache."
                : "Một gate, giai đoạn batch hoặc API operation có gọi AI · retry qua dispatcher cùng task được cộng gộp."}
          </p>
        </div>
        {!lab && (
          <select
            aria-label="Nguồn số liệu task"
            value={source}
            onChange={(e) => {
              setSource(e.target.value)
              setLimit(20)
            }}
          >
            <option value="current">Task đo từ bản cập nhật</option>
            <option value="historical">Lịch sử giai đoạn đã lưu</option>
          </select>
        )}
      </div>
      <div className="task-summary">
        <article className="rc-card rc-ink">
          <span>Task / giai đoạn có dữ liệu AI</span>
          <strong>
            <AnimatedValue value={summary.count} />
          </strong>
          <small>{summary.completed} task hoàn tất trong mẫu</small>
        </article>
        <article className="rc-card rc-lime">
          <span>Token / task hoàn tất</span>
          <strong>
            <AnimatedValue value={summary.averageTokens} />
          </strong>
          <small>
            {summary.tokenSamples} / {summary.completed} task đủ usage{" "}
            {source === "historical" ? "đã lưu" : "được ghi nhận"}
          </small>
        </article>
        <article className="rc-card rc-blue">
          <span>USD / task hoàn tất</span>
          <strong>
            <AnimatedValue value={summary.averageUsd} format={usd} />
          </strong>
          <small>
            {summary.costSamples} / {summary.completed} task đủ giá · ước tính
          </small>
        </article>
      </div>
      <div className="task-notices" role="status">
        {summary.partial > 0 && (
          <p>
            {summary.partial} task thiếu usage hoặc giá. Trung bình chỉ dùng
            task hoàn tất có đủ dữ liệu tương ứng.
          </p>
        )}
        {source === "historical" && (
          <p>
            Lịch sử không chứng minh toàn bộ chi phí thực của task; hai nguồn
            được hiển thị riêng, không cộng gộp.
          </p>
        )}
        {!lab &&
          (!report.taskReadComplete ||
            report.taskUsage?.errors > 0 ||
            report.taskUsage?.overflow > 0) && (
            <p>
              Phạm vi đọc/ghi task chưa đầy đủ. Mẫu đọc tối đa 1.000 bản ghi mỗi
              nguồn.
            </p>
          )}
        {lab && report.taskUsage?.complete === false && (
          <p>Ledger vượt giới hạn đọc; số liệu task chưa đầy đủ.</p>
        )}
        {over.length > 0 && (
          <p className="task-budget-alert">
            {over.length} task vượt mức {usd(budget)} theo chi phí đã biết.
          </p>
        )}
      </div>
      <div className="task-controls">
        <label>
          Sắp xếp
          <select
            aria-label="Sắp xếp task theo mức tiêu tốn"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="cost">USD cao nhất</option>
            <option value="tokens">Token cao nhất</option>
          </select>
        </label>
        <label>
          Mức nhắc USD/task
          <input
            type="number"
            min="0"
            step="0.01"
            value={threshold}
            placeholder="Chưa đặt"
            onChange={(e) => setThreshold(e.target.value)}
          />
        </label>
        <small>
          Mức nhắc chỉ áp dụng trong màn hình hiện tại; chưa gửi thông báo nền.
        </small>
      </div>
      <TaskTimeline rows={rows} report={report} />
      {!rows.length ? (
        <p className="perf-card perf-empty">
          Chưa có task AI được ghi nhận trong kỳ cho nguồn này.
        </p>
      ) : (
        <div className="task-list">
          {ranked.slice(0, limit).map((t) => (
            <details
              key={t.id}
              className="task-row"
              data-over={budget && t.knownCostUsd > budget ? "true" : undefined}
            >
              <summary>
                <span className="task-name">
                  <b>{t.label || t.kind}</b>
                  <small>
                    {status[t.status] || t.status} ·{" "}
                    {new Date(t.startedAt).toLocaleString("vi-VN")}
                  </small>
                </span>
                <span className="task-tokens">
                  <b>{value(t.usageSamples ? t.totalTokens : null)}</b>
                  <small>token {t.tokenComplete ? "" : "đã biết"}</small>
                </span>
                <span className="task-cost">
                  <b>{value(t.knownCostUsd, usd)}</b>
                  <small>{t.costComplete ? "USD ước tính" : t.knownCostUsd == null ? "Chưa có giá" : "USD đã biết"}</small>
                </span>
              </summary>
              <div className="task-detail">
                <p>{t.id}{t.entityId ? " · " + t.entityId : ""}</p>
                <dl>
                  <div>
                    <dt>
                      {t.historical ? "Bản ghi usage / lỗi" : "Lượt gọi / lỗi"}
                    </dt>
                    <dd>
                      {t.calls} / {t.failedCalls ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Đủ usage / có giá</dt>
                    <dd>
                      {t.usageSamples} / {t.pricedCalls} lượt
                    </dd>
                  </div>
                  <div>
                    <dt>Input / cached / output</dt>
                    <dd>
                      {value(t.inputTokens)} / {value(t.cachedInputTokens)} /{" "}
                      {value(t.outputTokens)}
                    </dd>
                  </div>
                </dl>
                {t.historical && (
                  <p>
                    Chỉ kết quả giai đoạn đã lưu. Không suy diễn token thiếu
                    hoặc các lần thử trước đó.
                  </p>
                )}
                {t.details.length > 0 ? (
                  <div className="perf-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Model / bước</th>
                          <th>Trạng thái</th>
                          <th>Input / cached / output</th>
                          <th>USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.details.map((c, i) => (
                          <tr key={i}>
                            <td>
                              {c.model}
                              {c.kind ? " · " + c.kind : ""}
                            </td>
                            <td>{status[c.status] || c.status}</td>
                            <td>
                              {value(c.inputTokens)} /{" "}
                              {value(c.cachedInputTokens)} /{" "}
                              {value(c.outputTokens)}
                            </td>
                            <td>{value(c.costUsd, usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>Không có chi tiết từng lượt gọi cho bản ghi này.</p>
                )}
                {t.detailTruncated && (
                  <p>
                    Chi tiết lượt gọi được rút gọn; tổng task vẫn dùng các lượt
                    đã ghi nhận.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
      {ranked.length > limit && (
        <button className="button" onClick={() => setLimit((v) => v + 20)}>
          Xem thêm task ({ranked.length - limit})
        </button>
      )}
    </section>
  )
}
