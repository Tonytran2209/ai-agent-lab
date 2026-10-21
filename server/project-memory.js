import {checksSatisfied,verificationPassed} from './verification.js';
import {fail} from './schemas.js';
import crypto from 'node:crypto';
const words=s=>new Set(String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=3));
export function createProjectMemory(db,service){
 db.exec('CREATE TABLE IF NOT EXISTS project_memory (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,data TEXT NOT NULL)');
 const rows=id=>db.prepare('SELECT data FROM project_memory WHERE project_id=? ORDER BY rowid DESC LIMIT 200').all(id).map(r=>JSON.parse(r.data));
 function sync(id){const p=service.project(id);for(const r of service.list().filter(r=>r.projectId===id&&r.repository===p.repository&&r.draft)){
  const accepted=r.status==='completed'&&r.result&&checksSatisfied(r)&&(verificationPassed(r)||r.release?.phase==='deployed')&&service.events(r.id).some(e=>e.type==='result_accepted');
  const rejection=r.status==='rejected'?service.events(r.id).filter(e=>e.type==='request_rejected').at(-1):null;
  if(!accepted&&!rejection)continue;
  const value={projectId:id,repository:p.repository,requestId:r.id,kind:accepted?'verified-outcome':'reviewer-decision',sourceCommit:r.baseCommit,resultCommit:accepted?r.result.commit:null,libraryVersionId:r.libraryVersionId,at:r.updatedAt,problem:r.draft.problem.slice(0,1000),module:r.draft.module,allowedPaths:r.draft.allowedPaths,acceptanceCriteria:r.draft.acceptanceCriteria.slice(0,5),policyReferences:r.draft.traceability?.slice(0,3).map(t=>({criterion:t.criterion.slice(0,200),rules:t.rules.slice(0,2).map(ref=>({...ref,quote:ref.quote.slice(0,220)}))})),documentationReview:r.result?.documentationReview?{...r.result.documentationReview,reason:r.result.documentationReview.reason.slice(0,400)}:undefined,checks:accepted?r.result.checks.map(c=>({command:c.command,passed:c.passed})):[],note:accepted?(r.acceptance?.mode==='automated-ci'?'CI đã xác minh; phát hành theo quyền được duyệt trước.':'Admin đã nghiệm thu và có bằng chứng kiểm tra/phát hành.'):rejection.detail?.slice(0,800),evidenceUrl:r.verification?.evidenceUrl||r.release?.prUrl||null};
  const key=crypto.createHash('sha256').update(JSON.stringify([id,r.id,value.kind,value.resultCommit,value.note])).digest('hex');
  db.prepare('INSERT OR IGNORE INTO project_memory VALUES (?,?,?)').run(key,id,JSON.stringify({...value,id:key,enabled:true}));
 }return rows(id);}
 return {
  list(id){service.project(id);return sync(id);},
  select(request){const query=words(request.feedback+' '+request.screen);return sync(request.projectId).filter(m=>m.enabled&&m.repository===request.repository&&m.requestId!==request.id).map(m=>({m,score:[...words(m.problem+' '+m.module)].filter(w=>query.has(w)).length})).filter(v=>v.score>=2).sort((a,b)=>b.score-a.score).slice(0,3).map(({m})=>m);},
  setEnabled(projectId,id,enabled){service.project(projectId);const m=rows(projectId).find(v=>v.id===id);if(!m)fail('Không tìm thấy bộ nhớ project.',404);db.prepare('UPDATE project_memory SET data=? WHERE id=? AND project_id=?').run(JSON.stringify({...m,enabled}),id,projectId);return {...m,enabled};},
  suggestions(id){const p=service.project(id),rs=service.list().filter(r=>r.projectId===id&&r.repository===p.repository);const groups=[];for(const r of rs){const w=words(r.feedback);let g=groups.find(g=>{const common=[...w].filter(t=>g.words.has(t)).length;return common>=4&&common/Math.max(w.size,g.words.size)>=.4;});if(!g){g={words:w,requests:[]};groups.push(g);}g.requests.push(r);}return groups.filter(g=>g.requests.length>=2).slice(0,8).map(g=>({title:g.requests[0].title,requestIds:g.requests.map(r=>r.id),count:g.requests.length,note:'Nhóm feedback tương tự; cần admin xác nhận nhu cầu, không tự tạo hoặc thực thi request.'}));}
 };
}
