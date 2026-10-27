import {offlineContractCheck,offlineContractRequest} from '../server/recheck-policy.js';
import path from 'node:path';
import crypto from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {matchesProject} from './projects.js';
export async function recheckArtifact(r,config,run,signal,prepare,env){
 if(!matchesProject(r,config)||!/^REQ-[A-F0-9]{8}$/.test(r.id)||!/^[a-f0-9]{40}$/.test(r.result?.commit)||!/^[a-f0-9]{40}$/.test(r.baseCommit))throw new Error('Sai project hoặc artifact.');
 const git=async args=>{const result=await run('git',['-C',config.repoPath,...args],{signal,env,timeout:60000});if(result.code)throw new Error('Không xác minh được Git: '+args[0]);return result.stdout.trim();};
 const remote=await git(['remote','get-url','origin']);if(![`https://github.com/${r.repository}.git`,`https://github.com/${r.repository}`,`git@github.com:${r.repository}.git`].includes(remote))throw new Error('Remote không khớp.');
 if(await git(['rev-parse',r.result.commit+'^'])!==r.baseCommit)throw new Error('Artifact sai pinned base.');
 const files=(await git(['diff','--name-only','--no-renames',r.baseCommit,r.result.commit])).split('\n').filter(Boolean).sort();
 if(!files.length||JSON.stringify(files)!==JSON.stringify([...r.result.changedPaths].sort())||files.some(p=>!r.draft.allowedPaths.includes(p)))throw new Error('Artifact vượt phạm vi.');
 const worktree=path.join(config.stateDir,'rechecks',r.id+'-'+crypto.randomUUID());await mkdir(path.dirname(worktree),{recursive:true,mode:0o700});
 await git(['worktree','add','--detach',worktree,r.result.commit]);
 try{
  await prepare(worktree,run,{env,signal});
  const build=await run('npm',['run','check'],{cwd:worktree,env,signal,timeout:5*60000});
  const whitespace=await run('git',['-C',worktree,'-c','core.whitespace=cr-at-eol','diff','--check',r.baseCommit,r.result.commit],{env,signal,timeout:60000});
  const additional=[];
  for(const cmd of r.recheck?.commands||[]){if(!['npm run typecheck','npm run build',offlineContractCheck].includes(cmd)||cmd===offlineContractCheck&&!offlineContractRequest(r))throw new Error('Unsupported recheck command');const checked=cmd===offlineContractCheck?await run(process.execPath,['node_modules/@playwright/test/cli.js','test','--config=playwright.agent-lab.config.mjs','tests/agent-lab/gate3-channels.spec.mjs','--grep','G3_OFFLINE|offline Threads','--reporter=line'],{cwd:worktree,env,signal,timeout:5*60000}):await run('npm',['run',cmd.slice(8)],{cwd:worktree,env,signal,timeout:5*60000});additional.push({command:cmd,passed:checked.code===0,output:('Independent exact-commit recheck '+r.result.commit+'; exit '+checked.code+'\n'+checked.stdout+'\n'+checked.stderr).slice(-3500)});}
  const status=await run('git',['-C',worktree,'status','--porcelain','--untracked-files=no'],{env,signal,timeout:60000});
  const observed=await run('git',['-C',worktree,'rev-parse','HEAD'],{env,signal,timeout:60000});
  if(observed.code||observed.stdout.trim()!==r.result.commit)throw new Error('HEAD đã thay đổi trong lúc kiểm tra.');
  if(status.code||status.stdout.trim())throw new Error('Kiểm tra đã thay đổi file tracked; không dùng bằng chứng này.');
  return [{command:'npm run check',passed:build.code===0,output:'Mac recheck worker independently executed on '+r.result.commit+'; exit '+build.code},{command:'git -c core.whitespace=cr-at-eol diff --check',passed:whitespace.code===0,output:'Compared pinned base to exact artifact commit; CRLF recognized, real trailing whitespace still rejected; exit '+whitespace.code},...additional];
 }finally{await run('git',['-C',config.repoPath,'worktree','remove','--force',worktree],{env,timeout:60000}).catch(()=>{});}
}
export async function pollRechecks(config,token,run,signal,prepare,env){
 const endpoint=new URL('/runner/rechecks',config.mcpUrl);
 const request=async(suffix='',body)=>{const res=await fetch(endpoint.href+(suffix||'?protocol=artifact-recheck-v2'),{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(res.status===404&&!suffix)return {requests:[]};if(!res.ok)throw new Error('Recheck API HTTP '+res.status);return res.json();};
 for(const r of (await request()).requests){
  if(signal?.aborted)return;if(!matchesProject(r,config))continue;
  let claim;try{claim=await request('/'+r.id+'/claim',{protocol:'artifact-recheck-v2'});}catch{continue;}
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  let pending=Promise.resolve(),busy=false;
  const timer=setInterval(()=>{if(busy)return;busy=true;pending=request('/'+r.id+'/heartbeat',{recheckToken:claim.recheckToken}).catch(()=>controller.abort()).finally(()=>{busy=false;});},60000);
  try{const checks=await recheckArtifact(claim.request,config,run,controller.signal,prepare,env);clearInterval(timer);await pending;if(controller.signal.aborted)throw new Error('Kiểm tra đã dừng hoặc mất claim.');await request('/'+r.id+'/report',{recheckToken:claim.recheckToken,resultRevision:claim.request.resultRevision,checks,note:'Đã kiểm tra độc lập artifact cũ, không gọi AI, không sửa source. Lịch sử kiểm tra thất bại được giữ nguyên.'});}
  catch(e){await request('/'+r.id+'/fail',{recheckToken:claim.recheckToken,note:String(e.message).slice(0,2000)}).catch(()=>{});}
  finally{clearInterval(timer);signal?.removeEventListener('abort',abort);await pending;}return;
 }
}
