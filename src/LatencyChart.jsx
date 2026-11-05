import React from "react"
import { latencyCurve } from "./runtime-chart-data.js"
const ms = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
        value >= 1000 ? value / 1000 : value,
      ) + (value >= 1000 ? " s" : " ms")
export default function LatencyChart({ http }) {
  const curve = latencyCurve(http)
  if (!curve.valid)
    return (
      <p className="rc-empty">
        Các mốc phân vị chưa nhất quán; chưa thể vẽ đường nối.
      </p>
    )
  if (!curve.points.length)
    return <p className="rc-empty">Chưa có mẫu độ trễ trong kỳ này.</p>
  return (
    <div className="rc-latency-curve">
      <svg
        viewBox="0 0 600 204"
        role="img"
        aria-label={
          "Các mốc phân vị độ trễ HTTP. " +
          curve.points
            .map((p) => p.label + ": " + ms(p.y === null ? null : p.value))
            .join(", ") +
          ". Trục ngang là các mốc phân vị, không phải thời gian."
        }
      >
        {curve.ticks.map((t) => (
          <g className="rc-latency-grid" key={t.value}>
            <line x1="66" x2="568" y1={t.y} y2={t.y} />
            <text x="53" y={t.y + 4} textAnchor="end">
              {ms(t.value)}
            </text>
          </g>
        ))}
        <path d={curve.path} className="rc-latency-line" pathLength="1" />
        {curve.points
          .filter((p) => p.y !== null)
          .map((p) => (
            <circle
              className="rc-latency-point"
              key={p.label}
              cx={p.x}
              cy={p.y}
              r="6"
            >
              <title>{p.label + ": " + ms(p.value)}</title>
            </circle>
          ))}
      </svg>
      <dl className="rc-latency-values">
        {curve.points.map((p) => (
          <div key={p.label}>
            <dt>{p.label}</dt>
            <dd>{ms(p.y === null ? null : p.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="rc-latency-note">
        Đường nối các mốc phân vị · không phải xu hướng theo thời gian.
      </p>
    </div>
  )
}
