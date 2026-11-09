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
