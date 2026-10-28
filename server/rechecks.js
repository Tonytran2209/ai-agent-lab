import {recoverableArtifact,rerunCommands,canonicalCheck} from './recheck-policy.js';
import {contractSatisfied} from './contracts.js';
import crypto from 'node:crypto';
import {transaction} from './db.js';
import {fail} from './schemas.js';
import {resultRevision,newVerification} from './verification.js';
export const whitespaceCommand='git -c core.whitespace=cr-at-eol diff --check';
export const recoverableWhitespace=r=>r.status==='failed'&&r.result?.localArtifact&&r.result.checks.some(c=>!c.passed&&c.command==='git diff --check')&&r.result.checks.every(c=>c.passed||c.command==='git diff --check');
export function createRechecks(db,service){
 const get=id=>service.rawForAnalysis(id),save=r=>db.prepare('UPDATE requests SET data=? WHERE id=?').run(JSON.stringify(r),r.id);
 const event=(r,type,actor,detail)=>{r.updatedAt=new Date().toISOString();save(r);db.prepare('INSERT INTO events(request_id,data) VALUES (?,?)').run(r.id,JSON.stringify({type,actor,detail,at:r.updatedAt}));return service.get(r.id);};
 const verify=(r,token)=>{const j=r.recheck;if(r.status!=='rechecking'||!j?.lease||!token||j.lease.tokenHash!==crypto.createHash('sha256').update(token).digest('hex')||Date.parse(j.lease.expiresAt)<=Date.now()||j.resultRevision!==resultRevision(r))fail('Claim kiểm tra lại không hợp lệ.');return j;};
 return {
  queue(id,actor,expected){return transaction(db,()=>{const r=get(id),p=service.project(r.projectId);service.assertRequestOpen(id);if(!recoverableArtifact(r)||r.lease||r.verification?.lease||r.recheck?.lease||!p.enabled||!p.runnerEnabled||r.recheck?.attempts>=3)fail('Chỉ kiểm tra lại build/typecheck/whitespace đã dừng, tối đa ba lần; kiểm tra khác cần xử lý riêng.');if(expected!==resultRevision(r))fail('Artifact đã thay đổi; đọc lại kết quả.');r.recheck={commands:rerunCommands(r),protocol:rerunCommands(r).length?'artifact-recheck-v2':undefined,phase:'queued',attempts:r.recheck?.attempts||0,resultRevision:expected,queuedAt:new Date().toISOString(),actor,lease:null};r.status='rechecking';return event(r,'checks_recheck_queued',actor,'Kiểm tra độc lập build/typecheck và diff trên đúng commit; không gọi AI hoặc sửa source.');});},
  list:protocol=>service.list().filter(r=>r.status==='rechecking'&&r.recheck?.phase==='queued'&&(!r.recheck.protocol||r.recheck.protocol===protocol)),
  claim(id,owner,protocol){return transaction(db,()=>{const r=get(id),j=r.recheck,p=service.project(r.projectId);service.assertRequestOpen(id);if(r.status!=='rechecking'||j?.phase!=='queued'||j.protocol&&j.protocol!==protocol||j.lease||j.resultRevision!==resultRevision(r)||!p.enabled||!p.runnerEnabled)fail('Không thể nhận kiểm tra lại.');const token=crypto.randomBytes(32).toString('hex');j.phase='running';j.attempts++;j.lease={owner,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+15*60000).toISOString()};save(r);return {request:service.get(id),recheckToken:token};});},
  heartbeat(id,token){return transaction(db,()=>{const r=get(id),j=verify(r,token);j.lease.expiresAt=new Date(Date.now()+15*60000).toISOString();save(r);return {ok:true};});},
  report(id,token,input){return transaction(db,()=>{const r=get(id),j=verify(r,token);if(input.resultRevision!==j.resultRevision)fail('Báo cáo không khớp artifact.');const checks=input.checks;const expected=['npm run check',whitespaceCommand,...(j.commands||[])];if(JSON.stringify(checks.map(c=>c.command))!==JSON.stringify(expected)||checks.some(c=>typeof c.passed!=='boolean'||typeof c.output!=='string'))fail('Cần đầy đủ kiểm tra độc lập đã ghim.');const owner=j.lease.owner;j.checks=checks;j.lease=null;j.phase=checks.every(c=>c.passed)?'passed':'failed';if(j.phase==='passed'){
    const superseded=r.result.checks.filter(c=>!c.passed&&canonicalCheck(c.command));
    r.checkHistory=[...(r.checkHistory||[]),...superseded.map(c=>({...c,commit:r.result.commit,resultRevision:j.resultRevision,supersededAt:new Date().toISOString(),reason:'Worker chạy lại lệnh tương ứng và kiểm tra tổng thể trên đúng commit; lỗi gốc được giữ trong lịch sử.'}))];
    r.result={...r.result,checks:[...r.result.checks.filter(c=>!superseded.includes(c)&&!expected.includes(c.command)),...checks],browserVerification:'ci'};if(contractSatisfied(r)){r.verification=newVerification(r,owner);r.status='verifying';}else{delete r.verification;r.status='failed';}
   }else r.status='failed';return event(r,j.phase==='passed'?'checks_rechecked':'checks_recheck_failed',owner,input.note);});},
  fail(id,token,note){return transaction(db,()=>{const r=get(id),j=verify(r,token),owner=j.lease.owner;j.lease=null;j.phase='failed';r.status='failed';return event(r,'checks_recheck_failed',owner,note);});},
  release(id,actor,stopped){return transaction(db,()=>{const r=get(id),j=r.recheck;if(!stopped||!j?.lease||Date.parse(j.lease.expiresAt)>Date.now())fail('Xác minh worker cũ đã dừng trước khi mở khóa claim hết hạn.');j.lease=null;j.phase='failed';r.status='failed';return event(r,'checks_recheck_released',actor,'Admin xác nhận worker kiểm tra cũ đã dừng.');});}
 };
}
