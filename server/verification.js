import {contractSatisfied} from './contracts.js';
import crypto from 'node:crypto';
const digest = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const resultRevision = r => digest(r.result);
export const browserFailure = c => !c.passed && /chrome|chromium|playwright|browser/i.test(c.command);
export function localChecksPassed(r) {
  return Boolean(r.result?.localArtifact) && r.result.checks.some(c=>c.command==='npm run check'&&c.passed) && r.result.checks.every(c=>c.passed||browserFailure(c));
}
export function verificationPassed(r) {
  return r.verification?.phase === 'passed' && r.verification.resultRevision === resultRevision(r);
}
export function checksSatisfied(r) {
  return contractSatisfied(r) && Boolean(r.result) && r.result.checks.some(c=>c.command==='npm run check'&&c.passed) && r.result.checks.every(c=>c.passed||browserFailure(c)&&verificationPassed(r));
}
export function newVerification(r,actor) {
  return {phase:'queued',resultRevision:resultRevision(r),actor,queuedAt:new Date().toISOString(),lease:null,note:'Chờ Mac đẩy draft PR để GitHub kiểm tra trình duyệt. Chưa được nghiệm thu, merge hoặc deploy.'};
}
