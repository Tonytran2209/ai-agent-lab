import {ciInfrastructure} from './ci-infrastructure.js';
import {verifyArtifactLineage} from './commit-lineage.js';
import {assessCi} from './ci-evidence.js';
// Only the supported, explicit browser command shape can be reconciled from CI.
export function browserCriterion(command){
 const m=/^(?:node node_modules\/@playwright\/test\/cli\.js|npx (?:--no-install )?playwright) test (.+)$/.exec(command);
 if(!m)return null;
 const config=/(^| )--config(?:=| )(playwright(?:\.[A-Za-z0-9_-]+)?\.config\.[cm]?[jt]s)(?= |$)/g;
 if([...m[1].matchAll(config)].length>1)return null;
 const tail=m[1].replace(config,(_,space)=>space).trim().replace(/ {2,}/g,' ');
 const fileMatch=/^(tests\/(?:browser|agent-lab)\/[A-Za-z0-9_./-]+\.spec\.[cm]?[jt]sx?) --grep (?:([A-Za-z0-9_-]+)|'([A-Za-z0-9_-]+(?:\|[A-Za-z0-9_-]+)*)'|"([A-Za-z0-9_-]+(?:\|[A-Za-z0-9_-]+)*)")$/.exec(tail);
 if(!fileMatch||fileMatch[1].split('/').includes('..'))return null;
 const grep=fileMatch[2]||fileMatch[3]||fileMatch[4],tags=[...new Set(grep.split('|'))];
 return tags.length<=8?{file:fileMatch[1],grep,tags}:null;
}
export function criterionLogEvidence(rows,logs,expectedCommit){
 const structured=logs.split('\n').filter(line=>line.includes('LAB_TEST_V1 '));
 if(structured.length){
  const records=structured.map(line=>{let v;try{v=JSON.parse(line.slice(line.indexOf('LAB_TEST_V1 ')+12));}catch{throw Error('Bằng chứng JSON CI không hợp lệ.');}
   if(expectedCommit&&v.commit!==expectedCommit||v.protocol!=='lab-test-v1'||!['desktop','mobile'].includes(v.project)||typeof v.file!=='string'||typeof v.title!=='string'||typeof v.id!=='string'||!['passed','failed','timedOut','skipped','interrupted'].includes(v.status))throw Error('Bằng chứng JSON CI không hợp lệ.');return v;});
  return rows.map(row=>{const spec=browserCriterion(row.verification.command);if(!spec)throw Error('Tiêu chí chưa có command browser được hỗ trợ.');const names=[];
   for(const tag of spec.tags)for(const project of ['desktop','mobile']){const found=records.filter(v=>v.file===spec.file&&v.project===project&&v.title.includes(tag));if(!found.length||found.some(v=>v.status!=='passed'))throw Error('Chưa có bằng chứng browser cho '+tag+' trên '+project);names.push(...found.map(v=>'['+v.project+'] '+v.file+' '+v.title));}
   return {criterionIndex:row.criterionIndex,command:row.verification.command,files:row.verification.files,names,format:'lab-test-v1'};});
 }
 const lines=logs.replace(/\x1b\[[0-9;]*m/g,'').split('\n');
 return rows.map(row=>{const spec=browserCriterion(row.verification.command);if(!spec)throw Error('Tiêu chí chưa có command browser được hỗ trợ.');
 const names=[];
 for(const tag of spec.tags)for(const device of ['desktop','mobile']){
  const relevant=lines.filter(l=>l.includes('['+device+']')&&l.includes(spec.file+':')&&l.includes(' › ')&&l.split(' › ').at(-1).includes(tag));
  if(relevant.some(l=>/\s-\s+\d+\s+\[(desktop|mobile)\]/.test(l)))throw Error('Có ca test tiêu chí bị bỏ qua.');
  const passed=relevant.filter(l=>/✓|✔/.test(l));
  if(!passed.length)throw Error('Chưa có bằng chứng browser cho '+tag+' trên '+device);
  names.push(...passed.map(l=>l.slice(l.indexOf('['+device+']')).trim()));
 }
 return {criterionIndex:row.criterionIndex,command:row.verification.command,files:row.verification.files,names:[...new Set(names)]};});
}
export async function collectCriterionCi(r,token,fetcher=fetch){
 const api=async(suffix,text=false)=>{const response=await fetcher(`https://api.github.com/repos/${r.repository}/${suffix}`,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','User-Agent':'ai-agent-lab',...(token?{Authorization:'Bearer '+token}:{})}});if(!response.ok)throw Error('Chưa đọc được GitHub CI: '+response.status);return text?response.text():response.json();};
 const rows=r.draft.traceability||[];if(r.workflowProtocol!=='direct-v1'&&!rows.length)throw Error('Thiếu tiêu chí để đối chiếu CI.');
 const branch=r.result.localArtifact.branch;if(!new RegExp('^lab/'+r.id+'-[0-9]+$').test(branch))throw Error('Sai nhánh artifact.');
 const prs=await api('pulls?state=open&head='+encodeURIComponent(r.repository.split('/')[0]+':'+branch)+'&base='+encodeURIComponent(r.branch));if(prs.length!==1)return null;
 const pr=await api('pulls/'+prs[0].number),commit=pr.head?.sha;
 if(pr.head?.ref!==branch||pr.head?.repo?.full_name!==r.repository||pr.base?.repo?.full_name!==r.repository||pr.base?.ref!==r.branch)throw Error('PR không khớp project.');
 const files=await api('pulls/'+pr.number+'/files?per_page=100');
 if(!files.length||files.length!==pr.changed_files||files.some(f=>!r.draft.allowedPaths.includes(f.filename)||f.previous_filename&&!r.draft.allowedPaths.includes(f.previous_filename)))throw Error('Artifact vượt phạm vi đã duyệt.');
 await verifyArtifactLineage(api,r.baseCommit,commit,r.result.commit);
 const checks=await api('commits/'+commit+'/check-runs?per_page=100'),evidence=assessCi(checks,await api('commits/'+commit+'/status'),commit);
 if(!evidence.ready){const infrastructure=await ciInfrastructure(api,checks,commit);return {pending:true,commit,prNumber:pr.number,prUrl:pr.html_url,failed:evidence.failed||evidence.failures.length>0,jobs:[...evidence.jobs,...infrastructure.jobs],failureKind:infrastructure.failureKind,failures:evidence.failures};}
 if(r.workflowProtocol==='direct-v1'){
  const reviewed=r.ciRepair?.phase==='pushed'?r.ciRepair.commit:r.result.commit;
  let verifiedTestFollowup=null;
  if(reviewed&&commit!==reviewed){
   await verifyArtifactLineage(api,r.baseCommit,commit,reviewed);
   const delta=await api('compare/'+reviewed+'...'+commit);
   if(delta.status!=='ahead'||delta.base_commit?.sha!==reviewed||!delta.files?.length||delta.files.length>20||delta.files.some(f=>!isTestFollowupPath(f.filename)||f.previous_filename&&!isTestFollowupPath(f.previous_filename)))throw Error('Commit mới cần đánh giá tài liệu/phạm vi lại; không chỉ sửa test.');
   verifiedTestFollowup={reviewedCommit:reviewed,changedPaths:delta.files.map(f=>f.filename)};
  }
  return {commit,branch,changedPaths:files.map(f=>f.filename),prNumber:pr.number,prUrl:pr.html_url,evidenceUrl:evidence.evidenceUrl,criteria:[],source:'github-actions',wholeCi:{commit,jobs:evidence.jobs},verifiedTestFollowup};
 }
 const url=evidence.evidenceUrl,match=new RegExp('^https://github.com/'+r.repository+'/actions/runs/[0-9]+/job/([0-9]+)$').exec(url||'');if(!match)throw Error('Thiếu job browser độc lập.');
 const job=await api('actions/jobs/'+match[1]);if(job.head_sha!==commit||job.name!=='browser-check'||job.conclusion!=='success'||job.status!=='completed')throw Error('Job browser sai commit hoặc chưa đạt.');
 const criteria=criterionLogEvidence(rows.filter(t=>t.verification.method==='test'&&browserCriterion(t.verification.command)),await api('actions/jobs/'+match[1]+'/logs',true),commit);
 criteria.push(...reportedCriterionEvidence(r,rows.filter(t=>t.verification.method==='inspection'||!browserCriterion(t.verification.command)),commit));
 return {commit,branch,changedPaths:files.map(f=>f.filename),prNumber:pr.number,prUrl:pr.html_url,evidenceUrl:url,criteria,source:'github-actions'};
}

// Preserve exact-head local evidence without re-labelling it as independent browser CI.
export function reportedCriterionEvidence(r,rows,commit){
 const refreshed=r.ciRepair?.phase==='pushed'&&r.ciRepair.commit===commit;
 const source=refreshed?r.ciRepair:r.result;
 return rows.map(row=>{
  const e=source?.criterionEvidence?.find(e=>e.criterionIndex===row.criterionIndex&&e.method===row.verification.method&&e.command===row.verification.command&&e.outcome==='passed'&&JSON.stringify(e.files)===JSON.stringify(row.verification.files));
  if(commit!==r.result.commit&&!refreshed||!e||row.verification.method==='test'&&!source.checks?.some(c=>c.command===e.command&&c.passed))throw Error('Bằng chứng cục bộ cần xác minh lại trên commit hiện tại: '+row.criterionIndex);
  return {criterionIndex:row.criterionIndex,method:e.method,command:e.command,files:e.files,names:[],detail:e.detail,source:'agent-reported'};
 });
}

export const isTestFollowupPath=p=>/^(?:tests\/(?:agent-lab|browser)\/|backend\/tests\/)[A-Za-z0-9_./-]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p)&&!p.split('/').includes('..');
