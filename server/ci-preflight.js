import {readRepositoryLibrary} from './library.js';
// Refresh before paid work; keep approvals, running claims and replay artifacts immutable.
export function createCiPreflight(db,service,config,{read=readRepositoryLibrary,clock=()=>Date.now(),ttl=60000,waitMs=10000,onSync=()=>{}}={}){
 db.exec('CREATE TABLE IF NOT EXISTS ci_preflight(project_id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const pending=new Map();let timer;
 const get=id=>JSON.parse(db.prepare('SELECT data FROM ci_preflight WHERE project_id=?').get(id)?.data||'null');
 const save=(id,v)=>db.prepare('INSERT OR REPLACE INTO ci_preflight VALUES(?,?)').run(id,JSON.stringify(v));
 const candidates=()=>service.list().filter(r=>['feedback','needs-triage','draft','awaiting-approval','approved'].includes(r.status)&&!r.lease&&!r.result&&!r.projectQueue?.blocked&&service.project(r.projectId).enabled);
 function forRequest(r){
  const v=get(r.projectId);
  if(!v||v.repository!==r.repository||v.branch!==r.branch||clock()-v.checkedAt>ttl*2)return {ready:false,state:'unchecked',message:'Chờ kiểm tra base và cấu hình CI trên GitHub.'};
  if(v.state==='unavailable')return {ready:false,state:v.state,message:'Chưa đọc được GitHub để kiểm tra CI; giữ nguyên kế hoạch, chưa gọi Codex.',checkedAt:v.checkedAt};
  if(v.state==='configuration')return {ready:false,state:v.state,message:'Cấu hình CI chưa tương thích: '+v.reason,checkedAt:v.checkedAt,head:v.head};
  if(r.baseCommit!==v.head)return {ready:false,state:'stale-base',message:r.approval?'Main đã đổi sau khi duyệt. Giữ nguyên base/quyền; cần chuẩn bị lại trước thực thi.':'Main đã đổi; cần khảo sát lại trên base mới trước khi duyệt.',base:r.baseCommit,head:v.head,checkedAt:v.checkedAt};
  return {ready:true,state:v.profile?'ready':'legacy',message:v.profile?'Base và cấu hình CI đã khớp phiên bản GitHub.':'Base đã khớp GitHub; project chưa khai báo writer-ci-v1.',head:v.head,profile:v.profile,checkedAt:v.checkedAt};
 }
 async function refreshProject(id,force=false){
  const existing=get(id);if(!force&&existing&&clock()-existing.checkedAt<ttl)return existing;
  if(pending.has(id))return pending.get(id);
  const task=(async()=>{
   const p=service.project(id),old=service.currentLibrary(id);
   try{
    const lib=await read(p.repository,p.branch,config.GITHUB_TOKEN,old);
    // Do not install a snapshot if settings or the library changed while GitHub was being read.
    const current=service.project(id);if(current.repository!==p.repository||current.branch!==p.branch||service.currentLibrary(id).id!==old.id){return save(id,{state:'unavailable',repository:p.repository,branch:p.branch,checkedAt:clock()});}
    if(lib.repository!==p.repository||lib.branch!==p.branch||lib.projectId!==id||!/^[a-f0-9]{40}$/.test(lib.sourceCommit))throw Error();
    if(lib!==old){service.addLibrary(lib);onSync(id);}
    const profile=lib.ciProfile;
    const v={state:profile?.status==='configuration'?'configuration':'ready',reason:profile?.reason,profile,repository:p.repository,branch:p.branch,head:lib.sourceCommit,checkedAt:clock()};save(id,v);
    // Only a completed, unapproved survey may be refreshed automatically. Failed/replay jobs stay stopped.
    for(const r of candidates().filter(r=>r.projectId===id&&r.baseCommit!==lib.sourceCommit)){
     if(r.approval||r.result||r.lease||r.ciRepair?.lease||r.verification?.lease||r.recheck?.lease||r.release||service.localPlanning.get(r.id)?.lease)continue;
     const job=service.localPlanning.get(r.id);
     if(p.runnerEnabled&&r.draft&&r.preparation?.status==='completed'&&job?.phase==='completed'&&!job.mode&&(job.attempts||0)<3){service.rebase(r.id,'CI preflight');service.localPlanning.enqueue(r.id,'CI preflight');}
     else if(!r.draft&&(!r.preparation||r.preparation.status==='queued')&&(!job||job.phase==='queued')&&job?.mode!=='report-only'){try{service.prepareProjectHead(r.id);}catch{}}
    }
    return v;
   }catch{const v={state:'unavailable',repository:p.repository,branch:p.branch,checkedAt:clock()};save(id,v);return v;}
  })().finally(()=>pending.delete(id));pending.set(id,task);return task;
 }
 async function refresh(id,force=false){const ids=id?[service.get(id).projectId]:[...new Set(candidates().map(r=>r.projectId))];const work=Promise.allSettled(ids.map(projectId=>refreshProject(projectId,force)));if(id){await work;return;}let timeout;try{await Promise.race([work,new Promise(resolve=>{timeout=setTimeout(resolve,waitMs);})]);}finally{clearTimeout(timeout);}}
 service.ciCompatibility=forRequest;service.refreshCiReadiness=refresh;
 return {forRequest,refresh,get,start(){if(!timer){timer=setInterval(()=>refresh().catch(()=>{}),ttl);timer.unref();void refresh().catch(()=>{});}},async stop(){clearInterval(timer);timer=null;await Promise.allSettled([...pending.values()]);}};
}
