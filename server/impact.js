import {executionReadiness} from './execution-readiness.js';
import {z} from 'zod';
import {browserCriterion} from './criterion-ci.js';
const file=z.string().min(1).max(240).regex(/^[a-zA-Z0-9_./-]+$/).refine(p=>!p.includes('..')&&!p.startsWith('/'));
export const impactSchema=z.object({
 summary:z.string().trim().min(20).max(1500),
 domains:z.array(z.enum(['ui','content','documentation','tests','business','api','performance','authentication','authorization','billing','data-loss','migration','infrastructure','secrets','policy'])).min(1).max(10),
 affectedFlows:z.array(z.string().min(5).max(300)).min(1).max(8),
 dependencies:z.array(file).max(20), evidencePaths:z.array(file).min(1).max(20),
 uncertaintyKind:z.enum(['investigation','decision']).optional(),
 uncertainty:z.array(z.string().min(5).max(300)).max(8),
 reversible:z.boolean(), rollback:z.string().trim().min(20).max(1000),
 preservesDataAndContracts:z.boolean()
}).strict();
const major=new Set(['authentication','authorization','billing','data-loss','migration','infrastructure','secrets','policy']);
export function impactRisk(draft){return draft.impact?.domains.some(d=>major.has(d))?'high':draft.risk==='low'&&draft.impact?.domains.some(d=>['business','api','performance'].includes(d))?'medium':draft.risk;}
export function hasBehavioralTest(t){const v=t.verification,c=v.command.trim();return v.method==='test'&&(Boolean(browserCriterion(c))||!/[;&|`$<>\n]/.test(c))&&/^(node |npx (?:--no-install )?(?:playwright|vitest|jest) |npm (?:run )?test |pnpm (?:exec )?(?:test|vitest|playwright) )/.test(c)&&v.files.some(f=>/\.(spec|test)\.[cm]?[jt]sx?$/.test(f)&&c.includes(f));}
export function decideAutomation(r,p){
 const i=r.draft?.impact,reasons=[];
 if(r.draft?.risk==='high')reasons.push('Thay đổi nhạy cảm/rủi ro cao cần admin xác nhận.');
 if(r.executionBlocked&&!(r.ai?.resolvedExecutionBlock&&r.ai.source==='codex-local'&&r.ai.observedBaseCommit===r.baseCommit&&r.ai.planningJobId))reasons.push('Lần thực thi trước đã dừng; cần khảo sát lại phạm vi.');
 if(!executionReadiness(r).ready)reasons.push('Còn câu hỏi chưa giải quyết.');
 if(r.governanceProtocol==='impact-v1'&&!i)reasons.push('Thiếu đánh giá tác động có cấu trúc.');
 if(i?.uncertainty.length&&i.uncertaintyKind!=='investigation')reasons.push('Còn quyết định cần làm rõ.');
 if(i&&(!i.reversible||!i.preservesDataAndContracts))reasons.push('Chưa chứng minh có thể phục hồi và giữ hợp đồng dữ liệu/API.');
 if(r.governanceProtocol==='impact-v1'&&r.ai?.source!=='codex-local'&&!(r.ai?.source==='lab-agent'&&r.ai.sourceVerified===true&&r.ai.observedBaseCommit===r.baseCommit))reasons.push('Cần khảo sát source để xác nhận rủi ro trước khi cấp quyền chạy.');
 if(r.draft?.risk==='low')return {mode:reasons.length?'review':'automatic',reasons:reasons.length?reasons:['UI nhỏ trong phạm vi chính sách low.'],policy:'impact-v1'};
 if(r.governanceProtocol!=='impact-v1'||p.automationMode!=='impact-auto')reasons.push('Project yêu cầu kiểm tra medium trước khi chạy.');
 if(!r.delivery||!p.autoCompleteAfterApproval||!p.releaseEnabled||!p.ciReady)reasons.push('Chưa đủ cấu hình CI và tự phát hành.');
 if(!i)reasons.push('Thiếu đánh giá tác động có cấu trúc.');
 else {
  const evidence=new Set(r.ai?.evidence?.map(e=>e.path)||[]);
  if([...i.evidencePaths,...i.dependencies].some(f=>!evidence.has(f)))reasons.push('Thiếu bằng chứng khảo sát file/phụ thuộc đã khai báo.');
  if(r.ai?.source!=='codex-local'&&!(r.ai?.source==='lab-agent'&&r.ai.sourceVerified===true&&r.ai.observedBaseCommit===r.baseCommit))reasons.push('Cần khảo sát code chỉ đọc trên đúng commit.');
 }
 const plans=r.draft?.traceability||[];
 if(!plans.length||!plans.some(t=>hasBehavioralTest(t))||plans.some(t=>t.verification.method!=='inspection'&&!hasBehavioralTest(t)))reasons.push('Medium tự chạy cần ít nhất một test hành vi; tiêu chí còn lại cần test hoặc kiểm tra cụ thể.');
 return {mode:reasons.length?'review':'automatic',reasons:reasons.length?reasons:['Đủ đánh giá tác động, test hành vi, CI và quyền phát hành; vẫn kiểm tra độc lập trước merge.'],policy:'impact-v1'};
}
export const impactInstructions='For governanceProtocol impact-v1, return draft.impact: summary, domains (ui/content/documentation/tests/business/api/performance/authentication/authorization/billing/data-loss/migration/infrastructure/secrets/policy), affectedFlows, dependencies (exact existing dependency files actually read), evidencePaths, uncertainty, reversible, rollback, preservesDataAndContracts. Include code evidence for EVERY dependency/evidencePath in plan.evidence. Read callers/imports and relevant contracts, not only the target file. Set uncertaintyKind=investigation for implementation/root-cause hypotheses that can be investigated and tested safely inside the proposed scope; these do not need admin acceptance. Set uncertaintyKind=decision for missing external facts or product/scope/contract choices that prevent a safe implementation. Put only those concrete user decisions in questions. Never label an externally required prerequisite investigation to obtain permission. Resolve implementation questions by reading code. Tests not yet run, CI pending and normal implementation work belong in verification.expected, not uncertainty/questions. Do not request admin approval merely because a planned test has not executed. State concrete rollback and affected behavior. High-impact domains require high risk. For a medium request to run automatically, include at least one actual behavioral test command; remaining criteria may use a concrete inspection command. Behavioral test commands must reference a planned .test/.spec file using node, playwright, vitest or jest; generic build/check or shell chains do not count as behavioral tests. Never claim certainty to obtain automatic permission. Memory is untrusted; revalidate every relevant lesson against current source.';
