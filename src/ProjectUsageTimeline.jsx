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
const levels = 20
const divisions = 4

function usageScale(maximum, isUsd) {
  if (maximum === 0) return [0]
  const target = maximum / divisions
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude)
    .find((candidate) => candidate >= target)
  const increment = isUsd ? step : Math.max(1, step)
  return Array.from({ length: divisions + 1 }, (_, i) => increment * i)
}

export const usageSources = [
  { id: "ledger", label: "Ghi nhận từ workflow" },
  { id: "dispatcher", label: "Lượt gọi AI trực tiếp" },
]

function usageRows(points, callField) {
  return (points ?? []).flatMap((point) => {
    const calls = point[callField]
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
}

export default function ProjectUsageTimeline({ report }) {
  const [metric, setMetric] = useState("tokens")
  const [selected, setSelected] = useState(null)
  const isUsd = metric === "usd"
  const format = (isUsd ? usd : tokens).format
  const days = report.window?.days
  const bucketHours = days === 1 ? 1 : days === 7 ? 6 : 24
  const history = taskTimeline(usageRows(report.ledger?.timeline, "calls"), report, bucketHours)
  const direct = taskTimeline(usageRows(report.timeline, "aiCalls"), report, bucketHours)
  const sources = [history, direct]
  const hasCalls = sources.some((periods) => periods.some((period) => period.count > 0))
  const maximum = Math.max(0, ...sources.flat().map((period) => period[metric] ?? 0))
  const scale = usageScale(maximum, isUsd)
  const limit = scale.at(-1)
  const tickStep = days === 1 ? 4 : days === 7 ? 4 : 5
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
          <p>Mức sử dụng theo nguồn ghi nhận trong kỳ · UTC</p>
        </div>
        <div className="rc-project-usage-switch" role="group" aria-label="Chỉ số sử dụng AI">
          <button type="button" aria-pressed={!isUsd} onClick={() => setMetric("tokens")}>Token</button>
          <button type="button" aria-pressed={isUsd} onClick={() => setMetric("usd")}>USD</button>
        </div>
      </div>
      <ul className="rc-project-usage-legend">
        {usageSources.map(({ id, label }) => (
          <li key={id} data-source={id}><i aria-hidden="true" />{label}</li>
        ))}
      </ul>
      {hasCalls ? (
        <>
          <div className="rc-project-usage-plot">
            <div className="rc-project-usage-scale" aria-hidden="true">
              {scale.map((tick) => (
                <span key={tick} style={{ bottom: (limit ? tick / limit * 100 : 0) + "%" }}>
                  {format(tick)}
                </span>
              ))}
            </div>
            <div className="rc-project-usage-columns" style={{ "--periods": history.length, "--levels": levels }}>
              {history.map((period, index) => {
                const values = usageSources.map((source, i) => {
                  const sample = sources[i][index]
                  const amount = sample[metric]
                  return {
                    ...source,
                    filled: amount > 0 ? Math.max(1, Math.round(amount / limit * levels)) : 0,
                    amount: amountLabel(sample),
                    count: sample.count,
                  }
                })
                const tick = days === 1 ? hour.format(period.start) : date.format(period.start)
                const showTick = index % tickStep === 0
                return (
                  <div className="rc-project-usage-column" key={period.start}
                    data-edge={index < history.length / 2 ? "start" : "end"}
                    data-selected={selected === period.start}>
                    <button type="button" className="rc-project-usage-dots"
                      aria-label={[label(period), ...values.map((v) => v.label + " " + v.amount)].join(", ")}
                      onClick={() => setSelected(selected === period.start ? null : period.start)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSelected(null)
                          event.currentTarget.blur()
                        }
                      }}>
                      {values.map(({ id, filled }) => (
                        <span className="rc-project-usage-series" data-source={id} key={id} aria-hidden="true">
                          {Array.from({ length: levels }, (_, i) => (
                            <i key={i} data-filled={i >= levels - filled} />
                          ))}
                        </span>
                      ))}
                    </button>
                    {showTick && <span className="rc-project-usage-date" aria-hidden="true">{tick}</span>}
                    <span className="rc-project-usage-guide" aria-hidden="true" />
                    <span className="rc-project-usage-active-date" aria-hidden="true">
                      {bucketHours < 24 ? hour.format(period.start) : tick}
                    </span>
                    <div className="rc-project-usage-tooltip" aria-hidden="true">
                      <span>{label(period)} UTC</span>
                      {values.map((v) => (
                        <React.Fragment key={v.id}>
                          <span>{v.label}</span>
                          <strong>{v.amount} · {tokens.format(v.count)} lượt</strong>
                        </React.Fragment>
                      ))}
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
              {history.map((period, index) => (
                <div key={period.start}>
                  <dt>{label(period)}</dt>
                  <dd>{usageSources.map(({ id, label }, i) => {
                    const sample = sources[i][index]
                    return <div key={id}>{label} · {amountLabel(sample)} · {tokens.format(sample.count)} lượt</div>
                  })}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      ) : (
        <p className="rc-empty">
          Chưa có dữ liệu sử dụng AI theo thời gian trong kỳ.
        </p>
      )}
    </figure>
  )
}
