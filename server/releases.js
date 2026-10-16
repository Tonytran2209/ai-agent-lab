import crypto from 'node:crypto';
import { checksSatisfied, verificationPassed } from './verification.js';
import { z } from 'zod';
import { fail } from './schemas.js';
export const releaseUpdate = z.object({
  phase: z.enum(['ci', 'deploying', 'deployed', 'failed']),
  note: z.string().min(5).max(2000),
  prNumber: z.number().int().positive().optional(),
  prUrl: z.string().url().optional(),
  mergeCommit: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  deploymentUrl: z.string().url().optional(),
});
export const digest = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const releaseFingerprint = r => digest([r.draft, r.baseCommit, r.libraryVersionId, r.result]);
export function queueRelease(r, actor, options = {}) {
  if (r.status !== 'completed' || !r.result || !r.result.localArtifact ||
      !checksSatisfied(r) || r.result.browserVerification === 'ci' && !verificationPassed(r)) fail('Cần kết quả đã nghiệm thu và commit cục bộ đã qua kiểm tra.');
  if (r.draft.risk === 'high' && options.confirmHighRisk !== true) fail('Cần xác nhận phát hành request rủi ro cao.');
  if (r.release && r.release.phase !== 'failed') fail('Request đã có tiến trình phát hành.');
  const previous = r.release || (r.verification?.prNumber ? {prNumber:r.verification.prNumber,prUrl:r.verification.prUrl} : undefined);
  r.release = { ...previous, phase: previous?.mergeCommit ? 'deploying' : previous?.prNumber ? 'ci' : 'queued',
    requestHash: releaseFingerprint(r), authorizedBy: actor, authorizedAt: new Date().toISOString(),
    phaseStartedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), note: 'Đã nghiệm thu; chờ Mac đẩy nhánh, kiểm tra CI và phát hành.', lease: null };
  return r;
}
