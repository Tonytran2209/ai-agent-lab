import React, { useState } from "react"
import { httpLatencyTimeline } from "./runtime-chart-data.js"

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 })
const duration = (ms) => ms == null ? "—" : ms >= 1000
  ? number.format(ms / 1000) + " s"
  : number.format(ms) + " ms"
const date = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
const hour = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })

export default function LatencyChart({ report }) {
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const { http } = report
  const periods = httpLatencyTimeline(report)
  const hasPoints = periods.some((point) => point.average !== null)
  const peak = Math.max(1, ...periods.map((point) => point.average ?? 0))
  const unit = 10 ** Math.floor(Math.log10(peak))
  const limit = Math.ceil(peak / unit) * unit
  const label = (time) => (report.window?.days === 1 ? hour : date).format(time)
  const points = periods.map((point, index) => ({
    ...point,
    x: (index + 0.5) * 100 / periods.length,
  }))
  const active = points.find((point) => point.time === (hovered ?? selected) && point.average !== null)
  const tickStep = Math.max(1, Math.ceil((points.length - 1) / 4))

  return (
    <>
      <header className="rc-latency-head">
        <div>
          <h3 className="rc-latency-title">Thời gian phản hồi HTTP</h3>
          <small className="rc-latency-count">{number.format(http.calls)} yêu cầu trong kỳ</small>
        </div>
        <p className="rc-latency-summary">
          <strong>{duration(http.averageMs)}</strong>
          <span>Trung bình trong kỳ</span>
        </p>
      </header>
      {hasPoints ? (
        <>
          <div className="rc-latency-plot">
            <div className="rc-latency-scale" aria-hidden="true">
              {[limit, limit / 2, 0].map((value) => <span key={value}>{duration(value)}</span>)}
            </div>
            <div className="rc-latency-graph">
              {points.map(({ time, average, calls, x }) => average !== null && (
                <button type="button" className="rc-latency-bar" key={time}
                  style={{ left: x + "%", height: average / limit * 100 + "%", width: Math.min(65 / points.length, 9) + "%" }}
                  aria-label={`${label(time)} UTC · ${duration(average)} trung bình · ${number.format(calls)} yêu cầu`}
                  aria-pressed={selected === time}
                  onPointerEnter={() => setHovered(time)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={() => setSelected(selected === time ? null : time)}
                />
              ))}
              <div className="rc-latency-ticks" aria-hidden="true">
                {points.filter((_, index) => index % tickStep === 0).map(({ time, x }) => (
                  <span key={time} style={{ left: x + "%" }}>{label(time)}</span>
                ))}
              </div>
            </div>
          </div>
          <small className="rc-latency-note">
            {active
              ? `${label(active.time)} UTC · ${duration(active.average)} trung bình · ${number.format(active.calls)} yêu cầu`
              : "Chọn một cột để xem thời gian trung bình và số yêu cầu."}
          </small>
        </>
      ) : (
        <p className="rc-empty">{http.calls ? "Chưa có độ trễ theo thời gian trong kỳ." : "Chưa có yêu cầu HTTP trong kỳ."}</p>
      )}
      {http.calls > 0 && (
        <details className="rc-latency-details">
          <summary>Chi tiết phân vị</summary>
          <dl>
            {[["P50", http.p50Ms], ["P95", http.p95Ms], ["P99", http.p99Ms]].map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{duration(value)}</dd></div>
            ))}
          </dl>
          <small>Các mốc phân vị là ước tính.</small>
        </details>
      )}
    </>
  )
}
