import crypto from 'node:crypto';
import { transaction } from './db.js';
export function aiLimits(config = {}) {
  const positive = (key, fallback) => { const n = Number(config[key]); return Number.isSafeInteger(n) && n > 0 ? n : fallback; };
  return { dailyCalls: positive('AI_DAILY_CALL_LIMIT', 100), dailyTokens: positive('AI_DAILY_TOKEN_LIMIT', 500000), requestCalls: positive('AI_REQUEST_CALL_LIMIT', 3) };
}
export function createAiLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_plans (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_attempts (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, day TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ai_attempt_day ON ai_attempts(day);`);
  const rows = () => db.prepare('SELECT data FROM ai_attempts').all().map(r => JSON.parse(r.data));
  return {
    cached(key) { const r = db.prepare('SELECT data FROM ai_plans WHERE key=?').get(key); return r ? JSON.parse(r.data) : null; },
    cache(key, draft) { db.prepare('INSERT OR REPLACE INTO ai_plans VALUES (?,?)').run(key, JSON.stringify(draft)); },
    reserve(requestId, model, reservedTokens, config) {
      return transaction(db, () => {
        const day = new Date().toISOString().slice(0,10), all = rows(), today = all.filter(r => r.day === day), limits = aiLimits(config);
        if (today.length >= limits.dailyCalls || today.reduce((n,r) => n + (r.usage?.total_tokens ?? r.reservedTokens),0) + reservedTokens > limits.dailyTokens || all.filter(r => r.requestId === requestId).length >= limits.requestCalls) {
          const e = new Error('Đã đạt hạn mức AI. Feedback vẫn được giữ; có thể soạn kế hoạch thủ công hoặc điều chỉnh hạn mức.'); e.status = 429; e.retryable = false; throw e;
        }
        const entry = {id: crypto.randomUUID(), requestId, model, day, reservedTokens, status:'reserved', at:new Date().toISOString()};
        db.prepare('INSERT INTO ai_attempts VALUES (?,?,?,?)').run(entry.id,requestId,day,JSON.stringify(entry)); return entry.id;
      });
    },
    finish(id, status, usage) {
      const row = db.prepare('SELECT data FROM ai_attempts WHERE id=?').get(id);
      if (!row) return;
      const r = JSON.parse(row.data);
      const cleanUsage = usage && Number.isSafeInteger(usage.input_tokens) && usage.input_tokens >= 0 && Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0 && Number.isSafeInteger(usage.total_tokens) && usage.total_tokens >= 0 ? {input_tokens:usage.input_tokens,output_tokens:usage.output_tokens,total_tokens:usage.total_tokens,cached_tokens:usage.input_tokens_details?.cached_tokens ?? 0} : null;
      db.prepare('UPDATE ai_attempts SET data=? WHERE id=?').run(JSON.stringify({...r,status,usage:cleanUsage,finishedAt:new Date().toISOString()}),id);
    },
    summary(config) {
      const day = new Date().toISOString().slice(0,10), today = rows().filter(r => r.day === day);
      return {day, timeZone:'UTC', limits:aiLimits(config), calls:today.length, tokens:today.reduce((n,r)=>n+(r.usage?.total_tokens ?? 0),0), reservedOrUnknownTokens:today.filter(r=>!r.usage).reduce((n,r)=>n+r.reservedTokens,0), cachedTokens:today.reduce((n,r)=>n+(r.usage?.cached_tokens ?? 0),0), failures:today.filter(r=>r.status==='failed').length};
    },
  };
}
