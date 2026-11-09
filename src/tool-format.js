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
