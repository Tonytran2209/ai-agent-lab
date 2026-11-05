import React from "react"
import { latencyDotPlot } from "./runtime-chart-data.js"
const ms = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
        value >= 1000 ? value / 1000 : value,
      ) + (value >= 1000 ? " s" : " ms")
export default function LatencyChart({ http }) {
  const { points, valid, hasSamples, limit } = latencyDotPlot(http)
  if (!valid)
    return <p className="rc-empty">Các mốc phân vị chưa nhất quán.</p>
  if (!hasSamples)
    return <p className="rc-empty">Chưa có mẫu độ trễ trong kỳ này.</p>

  return (
    <div className="rc-latency-plot">
      <dl className="rc-latency-lanes">
        {points.map(({ label, value }) => (
          <div className="rc-latency-row" data-primary={label === "P95"} key={label}>
            <dt>{label}</dt>
            <dd className="rc-latency-track" aria-hidden="true">
              {value !== null && (
                <span
                  className="rc-latency-fill"
                  style={{ width: (value / limit) * 100 + "%" }}
                />
              )}
            </dd>
            <dd className="rc-latency-number">{ms(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="rc-latency-row" aria-hidden="true">
        <div className="rc-latency-axis">
          <span>0 ms</span>
          <span>{ms(limit / 2)}</span>
          <span>{ms(limit)}</span>
        </div>
      </div>
    </div>
  )
}
