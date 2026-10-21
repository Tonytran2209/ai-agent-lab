import path from 'node:path';
import { mkdir, lstat, realpath } from 'node:fs/promises';
const legacyRepository='Tonytran2209/RebuildWriterStudioTool';
export function projectConfig(config, project) {
  if(!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(project.id)||! /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(project.repository)||project.repository.includes('..'))throw new Error('Project identity không hợp lệ.');
  const legacy=project.repository===legacyRepository;
  return {...config,repository:project.repository,projectId:project.id,branch:project.branch||'main',ciReady:project.ciReady,repoPath:legacy?config.repoPath:path.join(config.stateDir,'projects',project.id,'repository'),
    stateDir:legacy?config.stateDir:path.join(config.stateDir,'projects',project.id,'state'),releaseEnabled:config.releaseEnabled===true&&project.releaseEnabled===true,postDeployUrl:project.postDeployUrl||'',releaseEnvironment:project.releaseEnvironment||(legacy?config.releaseEnvironment:'')};
}
export async function connectProjects(config,token,run,signal) {
  const res=await fetch(new URL('/runner/projects',config.mcpUrl),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(res.status===404)return {configs:[{...config,repository:legacyRepository}],statuses:[]};
  if(!res.ok)throw new Error('Không đọc được danh sách project.');
  const {projects}=await res.json(), configs=[],statuses=[];
  for(const project of projects.filter(p=>p.enabled&&p.runnerEnabled)){
    if(signal?.aborted)break;
    const c=projectConfig(config,project);
    try{
      await mkdir(path.dirname(c.repoPath),{recursive:true,mode:0o700});
      let exists=true;try{const stat=await lstat(c.repoPath);if(stat.isSymbolicLink())throw new Error('Symlink checkout không hợp lệ.');}catch(e){if(e.code==='ENOENT')exists=false;else throw e;}
      if(!exists){
        const clone=await run('git',['-c','credential.helper=','-c','credential.helper=!'+(config.ghPath||'/opt/homebrew/bin/gh')+' auth git-credential','clone','--no-checkout','--','https://github.com/'+project.repository+'.git',c.repoPath],{signal,timeout:120000});
        if(clone.code)throw new Error('Clone thất bại.');
      }
      const origin=await run('git',['-C',c.repoPath,'remote','get-url','origin'],{signal,timeout:30000});
      if(origin.code||!['https://github.com/'+project.repository+'.git','https://github.com/'+project.repository,'git@github.com:'+project.repository+'.git'].includes(origin.stdout.trim()))throw new Error('Remote không khớp.');
      c.repoPath=await realpath(c.repoPath);await mkdir(c.stateDir,{recursive:true,mode:0o700});configs.push(c);statuses.push({projectId:project.id,repository:project.repository,repoReady:true,note:'Mac sẵn sàng nhận request đã duyệt.'});
    }catch{statuses.push({projectId:project.id,repository:project.repository,repoReady:false,note:'Không chuẩn bị được checkout. Kiểm tra quyền GitHub/dung lượng/remote trên Mac.'});}
  }
  return {configs,statuses};
}
export function matchesProject(row,config){return row.repository===(config.repository||legacyRepository)&&(!config.projectId||row.projectId===config.projectId);}
