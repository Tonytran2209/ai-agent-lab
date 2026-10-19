import crypto from 'node:crypto';
import {z} from 'zod';
import {transaction} from './db.js';
import {fail} from './schemas.js';
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
export const ciSetupOptions=z.object({autoMerge:z.boolean().default(false),enableRelease:z.boolean().default(false),releaseEnvironment:z.string().trim().max(200).default('')}).strict();
export const ciSetupUpdate=z.object({phase:z.enum(['ci','awaiting-merge','syncing','ready','failed']),note:z.string().min(3).max(2000),commit:z.string().regex(/^[a-f0-9]{40}$/).optional(),mergeCommit:z.string().regex(/^[a-f0-9]{40}$/).optional(),existing:z.boolean().optional(),prNumber:z.number().int().positive().optional()}).strict();
export function createCiSetup(db,projects,library){
 db.exec('CREATE TABLE IF NOT EXISTS ci_setup_jobs (project_id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const get=id=>{const row=db.prepare('SELECT data FROM ci_setup_jobs WHERE project_id=?').get(id);return row?JSON.parse(row.data):null;};
 const save=j=>db.prepare('INSERT INTO ci_setup_jobs VALUES (?,?) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data').run(j.projectId,JSON.stringify(j));
 const pub=j=>{if(!j)return null;const {lease,...rest}=j;return {...rest,lease:lease?{owner:lease.owner,expiresAt:lease.expiresAt}:null};};
 const log=(j,note)=>{j.note=note;j.updatedAt=new Date().toISOString();j.log=[...(j.log||[]),{at:j.updatedAt,note}].slice(-25);save(j);return pub(j);};
 const verify=(id,jobId,token)=>{const j=get(id);if(!j||j.id!==jobId||!j.lease||j.lease.hash!==digest(token)||Date.parse(j.lease.expiresAt)<=Date.now())fail('Claim thiết lập CI không hợp lệ/hết hạn.');return j;};
 return {
  get:id=>pub(get(id)),
  queue:()=>db.prepare('SELECT data FROM ci_setup_jobs').all().map(r=>JSON.parse(r.data)).filter(j=>['queued','ci','syncing'].includes(j.phase)&&projects.get(j.projectId).enabled&&projects.get(j.projectId).runnerEnabled).map(pub),
  enqueue(id,input,actor){return transaction(db,()=>{const p=projects.get(id),opts=ciSetupOptions.parse(input),old=get(id);if(!p.enabled||!p.runnerEnabled)fail('Bật project và Mac nhận request trước khi thiết lập CI.');if(opts.enableRelease&&!opts.releaseEnvironment)fail('Cần Railway environment khi chọn bật phát hành.',400);if(old?.phase==='failed'&&old.prNumber)fail('Giữ PR cũ; dùng Thử lại CI để tránh tạo PR trùng.');if(old?.lease||old&&['queued','ci','awaiting-merge','syncing'].includes(old.phase))return pub(old);const j={id:crypto.randomUUID(),projectId:id,repository:p.repository,branch:p.branch,baseCommit:library(p.libraryVersionId).sourceCommit,phase:'queued',actor,...opts,configurationRevision:p.configurationRevision||null,createdAt:new Date().toISOString(),lease:null};return log(j,'Đã xếp lịch thiết lập/kiểm tra CI trên Mac.');});},
  claim(id,jobId){return transaction(db,()=>{const p=projects.get(id),j=get(id);if(!p.enabled||!p.runnerEnabled||!j||j.id!==jobId||!['queued','ci','syncing'].includes(j.phase)||j.lease)fail('Job CI chưa sẵn sàng hoặc đang được giữ.');const token=crypto.randomBytes(32).toString('hex');j.lease={hash:digest(token),owner:'mac-ci-setup',expiresAt:new Date(Date.now()+15*60000).toISOString()};save(j);return {job:pub(j),setupToken:token};});},
  heartbeat(id,jobId,token){return transaction(db,()=>{const j=verify(id,jobId,token);j.lease.expiresAt=new Date(Date.now()+15*60000).toISOString();save(j);return {ok:true};});},
  verify,
  report(id,jobId,token,input,evidence){return transaction(db,()=>{const j=verify(id,jobId,token),u=ciSetupUpdate.parse(input);if(["ready","awaiting-merge"].includes(u.phase)&&!evidence?.ready)fail("Cần bằng chứng CI đã được server xác minh.");if(u.phase!=='failed'&&!({queued:['ci','ready'],ci:['ci','awaiting-merge','syncing','ready'],syncing:['syncing','ready']}[j.phase]||[]).includes(u.phase))fail('Sai thứ tự thiết lập CI.');if(j.existing!==undefined&&u.existing!==undefined&&j.existing!==u.existing)fail('Loại job CI đã thay đổi.');if(j.commit&&u.commit&&j.phase!=='syncing'&&u.commit!==j.commit)fail('Commit CI đã thay đổi.');if(j.prNumber&&u.prNumber&&j.prNumber!==u.prNumber)fail('PR CI đã thay đổi.');if(u.phase==='failed'&&j.commit&&j.phase==='syncing')delete u.commit;Object.assign(j,u,{lease:null});if(evidence?.evidenceUrl)j.evidenceUrl=evidence.evidenceUrl;
    if(u.phase==='ready'){projects.markCiReady(id,j.commit,j.evidenceUrl);const p=projects.get(id);if(j.enableRelease&&(p.configurationRevision||null)===j.configurationRevision)projects.update(id,{releaseEnvironment:j.releaseEnvironment,releaseEnabled:true});else if(j.enableRelease)j.releaseSkipped=true;}
    if(j.prNumber)j.prUrl='https://github.com/'+j.repository+'/pull/'+j.prNumber;return log(j,u.note);});},
  continue(id,actor){return transaction(db,()=>{const j=get(id);if(!j||j.phase!=='awaiting-merge'||j.lease)fail('CI chưa chờ hoàn tất.');j.autoMerge=true;j.phase='ci';return log(j,actor+' yêu cầu hoàn tất: xác minh lại CI trước khi merge.');});},
  retry(id,confirmStopped){return transaction(db,()=>{const j=get(id);if(!j)fail('Chưa có job CI.');if(j.lease){if(!confirmStopped)fail('Xác minh worker cũ đã dừng trước khi khôi phục job.');if(Date.parse(j.lease.expiresAt)>Date.now())fail('Worker còn claim hiệu lực; chưa thể mở khóa.');}else if(j.phase!=='failed')fail('Chỉ thử lại job đã dừng/lỗi.');j.lease=null;j.lastAttemptAt=new Date().toISOString();j.phase=j.mergeCommit?'syncing':j.prNumber||j.existing?'ci':'queued';return log(j,'Admin đã xếp lịch thử lại thiết lập CI, giữ PR/commit hiện có.');});},
 };
}
