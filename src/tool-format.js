// Display helpers shared by the Status tab and tool management.
const nf = (v, digits = 1) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(v)

// Milliseconds under one second, seconds under two minutes, then minutes and seconds.
export function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—"
  if (ms < 1000) return Math.round(ms) + " ms"
  const s = Math.round(ms / 1000)
  if (s < 120) return nf(ms / 1000) + " giây"
  return Math.floor(s / 60) + " phút" + (s % 60 ? " " + (s % 60) + " giây" : "")
}

export const formatPercent = (v) => (v == null ? "—" : nf(v, 2) + "%")

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const minutes = Math.max(0, Math.round((now - t) / 60000))
  if (minutes < 1) return "vừa xong"
  if (minutes < 60) return minutes + " phút trước"
  const hours = Math.round(minutes / 60)
  return hours < 48 ? hours + " giờ trước" : Math.round(hours / 24) + " ngày trước"
}

export function dateTime(ms) {
  return Number.isFinite(ms) ? new Date(ms).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" }) : "—"
}

// Compact duration for the Status tab: 55ms, 14.1s, 1m 32s.
export function compactTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—"
  if (ms < 1000) return Math.round(ms) + "ms"
  if (ms < 60000) return (Math.round(ms / 100) / 10).toString() + "s"
  const s = Math.round(ms / 1000)
  return Math.floor(s / 60) + "m " + (s % 60) + "s"
}

// 17:53:01 09/11/2026 in the viewer's local time.
export function clockDate(ms) {
  if (!Number.isFinite(ms)) return "—"
  const d = new Date(ms), p = (n) => String(n).padStart(2, "0")
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + " " + p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear()
}

// Average duration of each sub-job over the recent runs in history (measured steps only), in the
// tool's job order. A sub-job may be a step inside a Main Job run or a top-level run of its own.
export function stepAverages(tool) {
  const main = tool.jobs.find((j) => j.role === "main")?.name
  const subs = tool.jobs.filter((j) => j.role !== "main")
  const names = subs.length ? subs.map((j) => j.name) : tool.jobs.map((j) => j.name)
  const ok = (x) => !x.estimated && x.status === "success" && Number.isFinite(x.durationMs)
  const values = new Map(names.map((n) => [n, []]))
  const counted = new Set()
  tool.runs.forEach((r, i) => {
    for (const x of [...(r.job === main ? [] : [r]), ...r.steps]) {
      if (!values.has(x.job) || !ok(x)) continue
      values.get(x.job).push(x.durationMs)
      counted.add(i)
    }
  })
  const rows = names.map((name) => {
    const v = values.get(name), job = tool.jobs.find((j) => j.name === name)
    return { name, job, averageMs: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, samples: v.length }
  })
  const totalMs = rows.reduce((sum, r) => sum + (r.averageMs ?? 0), 0)
  return { rows: rows.map((r) => ({ ...r, share: totalMs && r.averageMs != null ? r.averageMs / totalMs : null })), totalMs: totalMs || null, runs: counted.size }
}

