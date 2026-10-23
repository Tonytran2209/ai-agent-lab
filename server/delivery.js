import {collectCriterionCi} from './criterion-ci.js';
import {assessCi} from './ci-evidence.js';
// Independent server reconciliation. No model calls or coding/publishing credentials.
export async function validateDelivery(r, token, fetcher=fetch) {
  const api=async suffix=>{
    const response=await fetcher(`https://api.github.com/repos/${r.repository}/${suffix}`,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'ai-agent-lab',...(token?{Authorization:`Bearer ${token}`}:{})}});
    if(!response.ok){const e=new Error(`Chưa xác minh được GitHub (HTTP ${response.status}).`);e.retryable=response.status===429||response.status>=500;throw e;}return response.json();
  };
  const reject=message=>{throw new Error(message);};
  if(!r.result?.localArtifact||!r.verification?.prNumber||r.verification.source!=='github-actions')reject('Thiếu PR/CI độc lập để tự phát hành.');
  const commit=r.result.commit,pr=await api('pulls/'+r.verification.prNumber);
  if(pr.state!=='open'||pr.merged||pr.head?.sha!==commit||pr.head?.ref!==r.result.localArtifact.branch||!new RegExp('^lab/'+r.id+'-[0-9]+$').test(pr.head.ref)||pr.head?.repo?.full_name!==r.repository||pr.base?.repo?.full_name!==r.repository||pr.base?.ref!==r.branch)reject('PR không khớp repository, branch hoặc commit đã duyệt.');
  const files=await api(`pulls/${pr.number}/files?per_page=100`),reported=new Set(r.result.changedPaths);
  if(!files.length||files.length!==pr.changed_files||files.length!==reported.size||files.some(f=>!reported.has(f.filename)||!r.draft.allowedPaths.includes(f.filename)||f.previous_filename&&!r.draft.allowedPaths.includes(f.previous_filename)))reject('Diff PR vượt phạm vi đã duyệt hoặc khác kết quả báo cáo.');
  const head=await api('commits/'+commit);
  if(head.parents?.length!==1||head.parents[0].sha!==r.baseCommit)reject('Commit không xuất phát từ base đã duyệt.');
  const evidence=assessCi(await api(`commits/${commit}/check-runs?per_page=100`),await api(`commits/${commit}/status`),commit);
  if(!evidence.ready){const e=new Error('CI chưa đạt độc lập trên đúng commit.');e.retryable=!evidence.failed;throw e;}
  return evidence.evidenceUrl;
}
export function createDelivery(service,config,{validate=validateDelivery}={}) {
  let timer,active;
  async function reconcile(){
    for(const candidate of service.criterionCiCandidates()){
      try{const proof=await collectCriterionCi(candidate,config.GITHUB_TOKEN);if(proof)service.reconcileCriterionCi(candidate.id,candidate.resultRevision,proof);else service.criterionCiWaiting(candidate.id,candidate.resultRevision);}catch{service.criterionCiWaiting(candidate.id,candidate.resultRevision,true);}
    }
    for(const candidate of service.deliveryCandidates()){
      try {const r=service.beginDelivery(candidate.id);const evidence=await validate(r,config.GITHUB_TOKEN);service.finishDelivery(r.id,r.resultRevision,evidence);}
      catch(e){service.deliveryFailed(candidate.id,e.message,Boolean(e.retryable||['TimeoutError','TypeError'].includes(e.name)));}
    }
  }
  const tick=()=>active|| (active=reconcile().finally(()=>{active=null;}));
  return {tick,start(){if(!timer){timer=setInterval(()=>tick().catch(()=>{}),15000);timer.unref();tick().catch(()=>{});}},async stop(){clearInterval(timer);timer=null;await active;}};
}
