import React, { useState } from "react"
import { taskTimeline } from "./task-usage-data.js"

const date = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", timeZone: "UTC",
})
const hour = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit", minute: "2-digit", timeZone: "UTC",
})
const tokens = new Intl.NumberFormat("vi-VN")
const usd = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 6,
})
const levels = 18

export default function ProjectUsageTimeline({ report, source }) {
  const [metric, setMetric] = useState("tokens")
  const [selected, setSelected] = useState(null)
  const isUsd = metric === "usd"
  const format = (isUsd ? usd : tokens).format
  const points = source === "ledger" ? report.ledger?.timeline : report.timeline
  const rows = (points ?? []).flatMap((point) => {
    const calls = source === "ledger" ? point.calls : point.aiCalls
    if (!calls || !Number.isFinite(point.usageSamples)) return []
    return [{
      startedAt: point.hour,
      count: calls,
      usageSamples: point.usageSamples,
      totalTokens: point.totalTokens,
      knownCostUsd: point.pricedCalls > 0 ? point.knownCostUsd : null,
      tokenComplete: point.usageSamples === calls,
      costComplete: point.pricedCalls === calls,
    }]
  })
  const days = report.window?.days
  const bucketHours = days === 1 ? 1 : days === 7 ? 6 : 24
  const periods = taskTimeline(rows, report, bucketHours)
  const hasCalls = periods.some((period) => period.count > 0)
  const maximum = Math.max(0, ...periods.map((period) => period[metric] ?? 0))
  const shortNumber = new Intl.NumberFormat("vi-VN", {
    notation: isUsd ? "standard" : "compact", maximumSignificantDigits: 3,
  })
  const scale = maximum > 0 ? [maximum, maximum * 2 / 3, maximum / 3, 0] : [0]
  const tickStep = Math.ceil(periods.length / 6)
  const label = (period) => {
    const first = date.format(period.start)
    const last = date.format(period.end)
    if (bucketHours < 24) return first + " · " + hour.format(period.start)
    return first === last ? first : first + "–" + last
  }
  const amountLabel = (period) => {
    const amount = period[metric]
    if (amount == null) return period.count ? "Chưa rõ" : "—"
    const partial = isUsd ? period.partialUsd : period.partialTokens
    return format(amount) + (partial ? "*" : "")
  }

  return (
    <figure className="rc-card rc-project-usage" data-metric={metric}>
      <div className="rc-project-usage-head">
        <div>
          <h3>Token & USD theo thời gian</h3>
          <p>Tổng mức sử dụng đã ghi nhận của dự án trong kỳ · UTC</p>
        </div>
        <div className="rc-project-usage-switch" role="group" aria-label="Chỉ số sử dụng AI">
          <button type="button" aria-pressed={!isUsd} onClick={() => setMetric("tokens")}>Token</button>
          <button type="button" aria-pressed={isUsd} onClick={() => setMetric("usd")}>USD</button>
        </div>
      </div>
      {hasCalls ? (
        <>
          <div className="rc-project-usage-plot">
            <div className="rc-project-usage-scale" aria-hidden="true">
              {scale.map((tick) => (
                <span key={tick} style={{ bottom: (maximum ? tick / maximum * 100 : 0) + "%" }}>
                  {isUsd ? "$" : ""}{shortNumber.format(tick)}
                </span>
              ))}
            </div>
            <div className="rc-project-usage-columns" style={{ "--periods": periods.length, "--levels": levels }}>
              {periods.map((period, index) => {
                const amount = period[metric]
                const filled = amount > 0 ? Math.max(1, Math.round(amount / maximum * levels)) : 0
                const amountText = amountLabel(period)
                const tick = days === 1 ? hour.format(period.start) : date.format(period.start)
                const showTick = days === 7 ? index % 4 === 0 : index % tickStep === 0
                return (
                  <div className="rc-project-usage-column" key={period.start}
                    data-edge={index < periods.length / 2 ? "start" : "end"}
                    data-selected={selected === period.start}>
                    <button type="button" className="rc-project-usage-dots"
                      aria-label={label(period) + ", " + amountText + (amount != null && !isUsd ? " token" : "")}
                      onClick={() => setSelected(selected === period.start ? null : period.start)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSelected(null)
                          event.currentTarget.blur()
                        }
                      }}>
                      {Array.from({ length: levels }, (_, i) => (
                        <i key={i} data-filled={i >= levels - filled} aria-hidden="true" />
                      ))}
                    </button>
                    {showTick && <span className="rc-project-usage-date" aria-hidden="true">{tick}</span>}
                    <div className="rc-project-usage-tooltip" aria-hidden="true">
                      <span>{label(period)} UTC</span>
                      <strong>{amountText}{amount != null && !isUsd ? " token" : ""}</strong>
                      <span>{tokens.format(period.count)} lượt ghi nhận</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <figcaption>— Không có lượt ghi nhận · * Số liệu chưa đầy đủ{isUsd && " · USD là chi phí ước tính"}</figcaption>
          <details>
            <summary>Xem số liệu theo thời gian</summary>
            <dl>
              {periods.map((period) => (
                <div key={period.start}>
                  <dt>{label(period)}</dt>
                  <dd>{amountLabel(period)} · {tokens.format(period.count)} lượt ghi nhận</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      ) : (
        <p className="rc-empty">
          {Array.isArray(points) && (source === "ledger" || points.every((point) => Number.isFinite(point.usageSamples)))
            ? "Chưa có lượt dùng AI được ghi nhận trong kỳ."
            : "Nguồn này chưa cung cấp số liệu token và USD theo thời gian."}
        </p>
      )}
    </figure>
  )
}
