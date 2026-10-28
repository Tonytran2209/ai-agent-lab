import {adapterPaths} from './ci-adapters.js';
import {adapterTemplate} from '../mac/ci-template.js';
import {assessCi,ciSetupPaths} from './ci-evidence.js';
import {fail} from './schemas.js';
export async function validateCiUpdate(project,job,update,token){
 const api=async p=>{const r=await fetch('https://api.github.com/repos/'+project.repository+'/'+p,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'ai-agent-lab',...(token?{Authorization:'Bearer '+token}:{})}});if(!r.ok)fail('Chưa xác minh được bằng chứng GitHub CI (HTTP '+r.status+').',502);return r.json();};
 if(update.phase==='ci'&&job.commit&&(!update.commit||update.commit===job.commit)&&(!update.prNumber||update.prNumber===job.prNumber))return null;
 if(update.phase==='syncing'&&job.phase==='syncing')return null;
 const managed=adapterPaths(job);
 let pr;if(job.prNumber||update.prNumber){pr=await api('pulls/'+(job.prNumber||update.prNumber));if(pr.head?.sha!==(job.commit||update.commit)||pr.head?.ref!=='lab-ci/'+job.id||pr.base?.ref!==project.branch||pr.base?.repo?.full_name!==project.repository||pr.head?.repo?.full_name!==project.repository)fail('Bằng chứng PR CI không đúng project/head/base.');const files=await api('pulls/'+pr.number+'/files?per_page=100');if(!(job.adapter?[managed.length]:[5,ciSetupPaths.length]).includes(files.length)||!ciSetupPaths.slice(0,5).every(p=>files.some(f=>f.filename===p))||pr.changed_files!==files.length||files.some(f=>!managed.includes(f.filename)||f.status!=='added'))fail('PR CI vượt scope file được phép.');}
 if(pr&&job.adapter){
  if(job.adapter.key!=='writer-react@1')fail('Adapter xác minh không được tạo PR.');
  const commit=await api('git/commits/'+pr.head.sha);if(commit.parents?.length!==1||commit.parents[0].sha!==job.baseCommit)fail('PR adapter sai lineage.');
  const read=async(p,ref=job.baseCommit)=>{const b=await api('contents/'+p+'?ref='+ref);if(b.type!=='file'||b.encoding!=='base64'||b.size>150000)fail('File adapter không hợp lệ.');return Buffer.from(b.content,'base64').toString('utf8');};
  const expected=await adapterTemplate(p=>read(p),project.branch,job.adapter);
  for(const ref of new Set([pr.head.sha,...(update.phase==='ready'?[update.commit||job.commit]:[])]))for(const [p,text] of Object.entries(expected))if(await read(p,ref)!==text)fail('Nội dung adapter không khớp phiên bản đã chọn: '+p);
 }
 if(update.phase==='syncing'&&job.phase!=='syncing'&&(!pr?.merged||pr.merge_commit_sha!==update.mergeCommit))fail('GitHub chưa xác nhận merge PR CI.');
 if(['awaiting-merge','ready'].includes(update.phase)){
  const commit=update.commit||job.commit;if(!commit)fail('Thiếu commit bằng chứng.');
  if(update.phase==='ready'){const head=await api('commits/'+encodeURIComponent(project.branch));if(head.sha!==commit)fail('CI chưa khớp HEAD branch đích.');if(pr&&!pr.merged)fail('PR CI chưa merge; chưa thể đánh dấu sẵn sàng.');if(!pr&&commit!==job.baseCommit)fail('CI hiện có không khớp base đã yêu cầu.');}
  const evidence=assessCi(await api('commits/'+commit+'/check-runs?per_page=100'),await api('commits/'+commit+'/status'),commit);if(!evidence.ready)fail('Hai job CI GitHub chưa đạt trên đúng commit.');return evidence;
 }
 return null;
}

export async function ciRetryHead(project,job,token){
 if(!job?.prNumber||job.mergeCommit)return null;
 const r=await fetch('https://api.github.com/repos/'+project.repository+'/pulls/'+job.prNumber,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'ai-agent-lab',...(token?{Authorization:'Bearer '+token}:{})}});
 if(!r.ok)fail('Không đọc được PR CI để thử lại.',502);
 const pr=await r.json();if(pr.state!=='open'||pr.merged||!pr.head?.sha)fail('PR CI không còn mở.');
 await validateCiUpdate(project,{...job,commit:undefined},{phase:'ci',commit:pr.head.sha,prNumber:job.prNumber},token);
 return {jobId:job.id,previousCommit:job.commit,commit:pr.head.sha};
}
