// Claim heartbeats run every 60 s against a 15 min lease. Abort a job only when the Lab
// definitively rejects the claim (MCP tool error or HTTP 4xx other than 408/429), or after
// several consecutive transient failures (network, timeout, 429, 5xx, Railway redeploy).
export const maxHeartbeatMisses = 3;
export function heartbeatRejected(error) {
  if (error?.mcpRejected) return true;
  const match = /(?:HTTP|API)[:\s]+(\d{3})\b/.exec(String(error?.message || ""));
  if (!match) return false;
  const status = Number(match[1]);
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
export function createHeartbeatGuard(onLost, { maxMisses = maxHeartbeatMisses } = {}) {
  let misses = 0, lost = false;
  return {
    ok() { if (!lost) misses = 0; },
    fail(error) {
      if (lost) return true;
      if (heartbeatRejected(error) || ++misses >= maxMisses) { lost = true; onLost(error); }
      return lost;
    },
    get misses() { return misses; },
  };
}
