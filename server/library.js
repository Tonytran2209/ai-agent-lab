import {readCiProfile} from './ci-profile.js';
import { fail } from './schemas.js';
import { repositorySchema, branchSchema, projectIdSchema } from './projects.js';
export const canonicalDocuments = ['project.md','policies/ownership.md','policies/automation.md','design/components.md','design/design.md','design/flows.md','design/sources.md','backend/api-contracts.md','backend/workflow.md','database/data-model.md','database/storage.md'].map(p=>'.agent-hub/'+p);
export const optionalDocuments = ['.agent-hub/design/user-guide.md'];
export const libraryFormatVersion = 2;
export function parseProjectContract(content, repository) {
  const id=content.match(/\bprojectId\s*:\s*[`"']?([a-z0-9-]+)/)?.[1] || content.match(/Project ID:\*\*\s*`([a-z0-9-]+)`/i)?.[1];
  const declared=content.match(/^repository:\s*[`"']?([A-Za-z0-9_.\/-]+)[`"']?\s*$/m)?.[1] || content.match(/\*\*Repository:\*\*\s*`([^`]+)`/i)?.[1];
  if(!id||!declared||declared.toLowerCase()!==repository.toLowerCase())fail('project.md cần khai báo đúng Project ID và Repository.',400);
  const projectId=projectIdSchema.parse(id),name=(content.match(/^name:\s*(.+)$/m)?.[1]||content.match(/^#\s+(.+)$/m)?.[1])?.trim().replace(/^["']|["']$/g,'');
  if(!name||name.length>120)fail('project.md cần tiêu đề tên project (tối đa 120 ký tự).',400);
  return {projectId,name};
}
export async function readRepositoryLibrary(repository, branch, token, existing) {
  repository=repositorySchema.parse(repository);
  const github=async suffix=>{
    const res=await fetch('https://api.github.com/repos/'+repository+'/'+suffix,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'ai-agent-lab',...(token?{Authorization:'Bearer '+token}:{})}});
    if(!res.ok)fail('Không đọc được GitHub library (HTTP '+res.status+'). Kiểm tra quyền repo/rate limit.',502);return res.json();
  };
  if(!branch)branch=(await github('')).default_branch;
  branch=branchSchema.parse(branch);
  const commit=await github('commits/'+encodeURIComponent(branch));
  if(existing?.libraryFormatVersion===libraryFormatVersion&&existing.ciInspectionVersion===1&&existing.repository===repository&&existing.branch===branch&&existing.sourceCommit===commit.sha)return existing;
  const tree=await github('git/trees/'+commit.sha+'?recursive=1');
  if(!/^[a-f0-9]{40}$/.test(commit.sha)||tree.truncated)fail('Không thể xác minh toàn bộ source map.',502);
  const paths=tree.tree.filter(v=>v.type==='blob').map(v=>v.path);
  if(canonicalDocuments.some(p=>!paths.includes(p)))fail('Repo chưa đủ 11 tài liệu canonical trong .agent-hub.',400);
  const selectedDocuments=[...canonicalDocuments,...optionalDocuments.filter(p=>paths.includes(p))];
  const documents=[];
  for(let i=0;i<selectedDocuments.length;i+=3){documents.push(...await Promise.all(selectedDocuments.slice(i,i+3).map(async file=>{
    const v=await github('contents/'+file+'?ref='+commit.sha);
    if(v.type!=='file'||v.encoding!=='base64'||v.size>120000)fail('Library document không hợp lệ: '+file,502);
    return {path:file,content:Buffer.from(v.content,'base64').toString('utf8')};
  })));}
  const identity=parseProjectContract(documents.find(d=>d.path==='.agent-hub/project.md').content,repository);
  return {...identity,repository,branch,sourceCommit:commit.sha,syncedAt:new Date().toISOString(),documents,sourcePaths:paths,libraryFormatVersion,ciInspectionVersion:1,ciProfile:await readCiProfile(tree.tree,github,commit.sha),ciReady:paths.some(p=>/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p))};
}
export async function syncLibrary(service, token, projectId='writer-studio') {
  const p=service.project(projectId),previous=service.currentLibrary(projectId),next=await readRepositoryLibrary(p.repository,p.branch,token,previous);return next===previous?previous:service.addLibrary(next);
}
