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

  const p95 = points.find(({ label }) => label === "P95").value
  const positions = points.map(({ value }) => value === null ? null : 100 - value / limit * 100)
  const curve = positions.map((y, index) => {
    if (y === null) return ""
    const x = index * 50
    const previousY = positions[index - 1]
    if (previousY == null) return `M ${x} ${y}`
    const middle = x - 25
    return `C ${middle} ${previousY}, ${middle} ${y}, ${x} ${y}`
  }).join(" ")
  return (
    <>
      {p95 !== null && (
        <p className="rc-latency-summary">
          <strong>{ms(p95)}</strong>
          <span>95% yêu cầu phản hồi trong mốc này hoặc nhanh hơn.</span>
        </p>
      )}
      <div className="rc-latency-graph">
        <svg className="rc-latency-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={curve} vectorEffect="non-scaling-stroke" />
        </svg>
        <dl className="rc-latency-columns">
          {points.map(({ label, value }, index) => (
            <div className="rc-latency-column" data-primary={label === "P95"} key={label}>
              <dt>{label.slice(1)}% yêu cầu</dt>
              <dd>
                {value === null ? "Chưa có số liệu" : "Trong " + ms(value)}
                {value !== null && (
                  <span className="rc-latency-marker" style={{ "--point-y": positions[index] / 100 }} aria-hidden="true" />
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  )
}
