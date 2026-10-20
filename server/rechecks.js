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
  queue(id,actor,expected){return transaction(db,()=>{const r=get(id),p=service.project(r.projectId);if(!recoverableWhitespace(r)||r.lease||r.verification?.lease||r.recheck?.lease||!p.enabled||!p.runnerEnabled||r.recheck?.attempts>=3)fail('Chỉ kiểm tra lại lỗi whitespace đã dừng, tối đa ba lần; các lỗi khác cần sửa code.');if(expected!==resultRevision(r))fail('Artifact đã thay đổi; đọc lại kết quả.');r.recheck={phase:'queued',attempts:r.recheck?.attempts||0,resultRevision:expected,queuedAt:new Date().toISOString(),actor,lease:null};r.status='rechecking';return event(r,'checks_recheck_queued',actor,'Kiểm tra độc lập đúng commit, nhận diện CRLF; không gọi AI hoặc sửa source.');});},
  list:()=>service.list().filter(r=>r.status==='rechecking'&&r.recheck?.phase==='queued'),
  claim(id,owner){return transaction(db,()=>{const r=get(id),j=r.recheck,p=service.project(r.projectId);if(r.status!=='rechecking'||j?.phase!=='queued'||j.lease||j.resultRevision!==resultRevision(r)||!p.enabled||!p.runnerEnabled)fail('Không thể nhận kiểm tra lại.');const token=crypto.randomBytes(32).toString('hex');j.phase='running';j.attempts++;j.lease={owner,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+15*60000).toISOString()};save(r);return {request:service.get(id),recheckToken:token};});},
  heartbeat(id,token){return transaction(db,()=>{const r=get(id),j=verify(r,token);j.lease.expiresAt=new Date(Date.now()+15*60000).toISOString();save(r);return {ok:true};});},
  report(id,token,input){return transaction(db,()=>{const r=get(id),j=verify(r,token);if(input.resultRevision!==j.resultRevision)fail('Báo cáo không khớp artifact.');const checks=input.checks;if(checks.length!==2||checks[0].command!=='npm run check'||checks[1].command!==whitespaceCommand)fail('Cần hai kiểm tra độc lập bắt buộc.');const owner=j.lease.owner;j.checks=checks;j.lease=null;j.phase=checks.every(c=>c.passed)?'passed':'failed';if(j.phase==='passed'){
    const previous={command:'git diff --check',passed:false,output:r.result.checks.find(c=>!c.passed)?.output,commit:r.result.commit,resultRevision:j.resultRevision,supersededAt:new Date().toISOString(),reason:'Runner kiểm tra lại đúng diff với core.whitespace=cr-at-eol; không bỏ qua space/tab thừa.'};
    r.checkHistory=[...(r.checkHistory||[]),previous];r.result={...r.result,checks:[...r.result.checks.filter(c=>c.command!=='git diff --check'&&c.command!=='npm run check'&&c.command!==whitespaceCommand),...checks],browserVerification:'ci'};r.verification=newVerification(r,owner);r.status='verifying';
   }else r.status='failed';return event(r,j.phase==='passed'?'checks_rechecked':'checks_recheck_failed',owner,input.note);});},
  fail(id,token,note){return transaction(db,()=>{const r=get(id),j=verify(r,token),owner=j.lease.owner;j.lease=null;j.phase='failed';r.status='failed';return event(r,'checks_recheck_failed',owner,note);});},
  release(id,actor,stopped){return transaction(db,()=>{const r=get(id),j=r.recheck;if(!stopped||!j?.lease||Date.parse(j.lease.expiresAt)>Date.now())fail('Xác minh worker cũ đã dừng trước khi mở khóa claim hết hạn.');j.lease=null;j.phase='failed';r.status='failed';return event(r,'checks_recheck_released',actor,'Admin xác nhận worker kiểm tra cũ đã dừng.');});}
 };
}
