// Runner presence: a fresh heartbeat is required. A reported loop error only counts as
// disconnected once it has persisted past the grace period, so one failed poll (Railway
// redeploy, Wi-Fi blip, brief 5xx) no longer flips the UI, notifications or cloud dispatch.
export const runnerStaleMs = 120000;
export const runnerErrorGraceMs = 150000;
export function runnerConnected(value, now = Date.now()) {
  if (!value?.lastSeenAt) return false;
  const seen = Date.parse(value.lastSeenAt);
  if (!Number.isFinite(seen) || now - seen >= runnerStaleMs) return false;
  if (value.phase !== "error") return true;
  const since = Date.parse(value.errorSince || value.lastSeenAt);
  return Number.isFinite(since) && now - since < runnerErrorGraceMs;
}
export function withErrorSince(next, previous, now = Date.now()) {
  if (next.phase !== "error") { const { errorSince, ...rest } = next; return rest; }
  const since = previous?.phase === "error" && previous.errorSince ? previous.errorSince : new Date(now).toISOString();
  return { ...next, errorSince: since };
}
