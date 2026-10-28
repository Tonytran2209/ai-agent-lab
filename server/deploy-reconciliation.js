import {assessCi} from './ci-evidence.js';
import {fail} from './schemas.js';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const maintenance=p=>['package.json','pnpm-lock.yaml','.mise.toml','nixpacks.toml','railpack.json','railway.toml','AGENTS.md','docs/browser-ci.md'].includes(p)||/^\.github\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/.test(p)||/^tests\/agent-lab\/(?:check-deploy-contract|deploy-contract\.test)\.mjs$/.test(p);
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
function serviceUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||!['railway.com','railway.app'].includes(u.hostname)||u.username||u.password||u.port)return null;const m=/^\/project\/([a-f0-9-]+)\/service\/([a-f0-9-]+)$/.exec(u.pathname);const env=u.searchParams.get('environmentId'),id=u.searchParams.get('id');return m&&env&&id?{project:m[1],service:m[2],environment:env,deployment:id,url:u.href}:null;}catch{return null;}}
export function canReconcileDeployment(r){return Boolean(r.status==='completed'&&!r.archivedAt&&!r.stopControl&&r.result&&r.release?.phase==='failed'&&sha(r.release.mergeCommit)&&r.release.prNumber&&!r.lease&&!r.release.lease&&!r.verification?.lease&&!r.ciRepair?.lease&&!r.recheck?.lease&&!r.planning?.lease);}
export async function verifyRecoveredDeployment(r,p,deployedCommit,token,{fetcher=fetch,discoverHead=false}={}){
 if(!canReconcileDeployment(r)||!(sha(deployedCommit)||discoverHead&&deployedCommit===null)||r.repository!==p.repository||r.branch!==p.branch)fail('Chỉ đồng bộ phát hành đã merge, bị lỗi và không còn worker giữ claim.',409);
 const original=r.release.mergeCommit;
 const api=async suffix=>{const response=await fetcher('https://api.github.com/repos/'+r.repository+'/'+suffix,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','User-Agent':'ai-agent-lab',...(token?{Authorization:'Bearer '+token}:{})}});if(!response.ok)fail('Chưa đọc được bằng chứng deploy trên GitHub: '+response.status,502);return response.json();};
 const head=await api('commits/'+encodeURIComponent(r.branch));if(discoverHead&&deployedCommit===null)deployedCommit=head.sha;if(!sha(deployedCommit)||head.sha!==deployedCommit)fail('Commit phục hồi phải là main hiện tại của đúng project.',409);
 const pr=await api('pulls/'+r.release.prNumber);if(!pr.merged||pr.merge_commit_sha!==original||pr.base?.repo?.full_name!==r.repository||pr.base?.ref!==r.branch||pr.head?.repo?.full_name!==r.repository||pr.head?.sha!==r.result.commit)fail('PR hoặc merge gốc không khớp request đã nghiệm thu.',409);
 let paths=[];
 if(deployedCommit!==original){
  const delta=await api('compare/'+original+'...'+deployedCommit);
  if(delta.status!=='ahead'||delta.base_commit?.sha!==original||!delta.commits?.length||delta.commits.length>8||delta.total_commits!==delta.commits.length||!delta.files?.length||delta.files.length>20)fail('Lịch sử phục hồi không đầy đủ hoặc vượt giới hạn.',409);
  let parent=original;for(const c of delta.commits){if(c.parents?.length!==1||c.parents[0].sha!==parent)fail('Phục hồi phải nối tiếp merge gốc, không được thay lịch sử.',409);parent=c.sha;}if(parent!==deployedCommit)fail('Sai commit cuối của phục hồi.',409);
  if(delta.files.some(f=>!maintenance(f.filename)||f.previous_filename&&!maintenance(f.previous_filename)))fail('Commit phục hồi đổi source/phụ thuộc ngoài cấu hình deploy; cần request riêng.',409);
  paths=delta.files.map(f=>f.filename);
  if(paths.includes('package.json')){
   const read=async ref=>{const v=await api('contents/package.json?ref='+ref);if(v.encoding!=='base64'||v.type!=='file'||v.size>100000)fail('Manifest không hợp lệ.');return JSON.parse(Buffer.from(v.content,'base64').toString('utf8'));};
   const [before,after]=await Promise.all([read(original),read(deployedCommit)]);
   if(after.packageManager&&!/^npm@\d+\.\d+\.\d+$/.test(after.packageManager)||after.scripts?.start&&after.scripts.start!=='bash start.sh')fail('Manifest phục hồi có lệnh không được hỗ trợ.',409);
   for(const pkg of [before,after]){delete pkg.packageManager;if(pkg.scripts)delete pkg.scripts.start;}
   if(canonical(before)!==canonical(after))fail('Phục hồi không được thay dependency hoặc các lệnh sản phẩm.',409);
  }
 }
 const current=await api('commits/'+deployedCommit+'/status'),previous=await api('commits/'+original+'/status');
 const latest=rows=>{const map=new Map();for(const row of rows||[]){if(!map.has(row.context))map.set(row.context,row);}return [...map.values()];};
 const candidates=latest(current.statuses).filter(s=>s.state==='success'&&serviceUrl(s.target_url)).filter(s=>latest(previous.statuses).some(old=>{const a=serviceUrl(old.target_url),b=serviceUrl(s.target_url);return old.context===s.context&&a&&a.project===b.project&&a.service===b.service&&a.environment===b.environment;}));
 if(candidates.length!==1)fail('Chưa có xác nhận Railway thành công cho đúng service/environment.',409);
 const railway=candidates[0],binding=serviceUrl(railway.target_url),environment=r.delivery?.environment||p.releaseEnvironment;
 const deployments=await api('deployments?sha='+deployedCommit+'&per_page=100');
 const deployment=deployments.find(d=>d.sha===deployedCommit&&d.environment===environment&&d.creator?.login==='railway-app[bot]');if(!deployment)fail('Thiếu deployment chính chủ Railway cho environment đã duyệt.',409);
 const states=await api('deployments/'+deployment.id+'/statuses');if(states[0]?.state!=='success'||states[0]?.creator?.login!=='railway-app[bot]')fail('Railway chưa xác nhận deployment cuối cùng thành công.',409);
 const checks=await api('commits/'+deployedCommit+'/check-runs?per_page=100'),ci=assessCi(checks,current,deployedCommit);if(!ci.ready)fail('Commit phục hồi chưa đạt đầy đủ writer-check/browser-check.',409);
 let postDeployCheck;
 if(p.postDeployUrl){const u=new URL(p.postDeployUrl);if(u.protocol!=='https:'||!/^[a-z0-9-]+\.up\.railway\.app$/.test(u.hostname)||u.username||u.password||u.port||u.search||u.hash)fail('URL smoke check không hợp lệ.');const response=await fetcher(u.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});await response.body?.cancel();if(!response.ok)fail('Smoke check phục hồi chưa đạt: '+response.status,409);postDeployCheck={url:u.href,status:response.status,checkedAt:new Date().toISOString()};}
 // Re-read both identities after bounded remote I/O; never apply a stale observation.
 const [freshHead,freshStates]=await Promise.all([api('commits/'+encodeURIComponent(r.branch)),api('deployments/'+deployment.id+'/statuses')]);if(freshHead.sha!==deployedCommit||freshStates[0]?.id!==states[0]?.id||freshStates[0]?.state!=='success')fail('Deployment/main đã đổi trong lúc đối chiếu; đọc lại trước khi đồng bộ.',409);
 return {protocol:'deployment-reconciliation-v1',originalMergeCommit:original,deployedCommit,deploymentUrl:binding.url,deploymentId:deployment.id,deploymentStatusId:states[0].id,environment,ciEvidenceUrl:ci.evidenceUrl,changedPaths:paths,observedAt:new Date().toISOString(),...(postDeployCheck?{postDeployCheck}:{})};
}
