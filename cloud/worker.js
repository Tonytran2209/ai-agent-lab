// One bounded cloud cycle. Same exact-scope/claim/check implementation as Mac;
// credentials stay in the supervisor, never in model or package-check environment.
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {command,connect,executeRequest,childEnvironment} from '../mac/runner.js';
import {connectProjects,matchesProject} from '../mac/projects.js';
import {pollPlanning} from '../mac/planning.js';
import {pollReleases} from '../mac/release.js';
import {pollVerifications} from '../mac/verify.js';
export async function cloudCycle(config,token,{run=command,signal}={}){
 const connected=await connectProjects(config,token,run,signal),connection=await connect(config,token);
 const queue=async endpoint=>{const response=await fetch(new URL(endpoint,config.mcpUrl),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Cloud queue unavailable.');return response.json();};
 try{
  for(const c of connected.configs)for(const [key,value] of [['user.name','Agent Lab Cloud'],['user.email','agent-lab@users.noreply.github.com']]){const result=await run('git',['-C',c.repoPath,'config',key,value]);if(result.code)throw Error('Git identity setup failed.');}
  const pending=(await queue('/runner/planning')).jobs;
  if(pending.some(j=>connected.configs.some(c=>matchesProject(j,c)))){await pollPlanning(connected.configs,token,run,signal,childEnvironment(process.env));return;}
  const remote=[...(await queue('/runner/verifications')).requests.filter(r=>r.verification?.phase==='ci'),...(config.releaseEnabled?(await queue('/runner/releases')).requests.filter(r=>r.release?.prNumber&&['ci','deploying'].includes(r.release.phase)):[])];
  let selected=remote.find(r=>connected.configs.some(c=>matchesProject(r,c)));
  if(!selected){const {requests}=await connection.call('list_ready_requests');selected=[...requests].reverse().find(r=>connected.configs.some(c=>matchesProject(r,c)));if(!selected)return;const c=connected.configs.find(c=>matchesProject(selected,c));await executeRequest({packet:await connection.call('get_request',{requestId:selected.id}),call:connection.call,config:c,run,signal});}
  const c=connected.configs.find(c=>matchesProject(selected,c)),ids=new Set([selected.id]),deadline=Date.now()+12*60000;
  while(!signal?.aborted&&Date.now()<deadline){const packet=await connection.call('get_request',{requestId:selected.id}),now=packet.request;
   if(now.status==='verifying')await pollVerifications(c,token,run,signal,async()=>{},ids);
   else if(now.status==='completed'&&now.release&&['queued','ci','deploying'].includes(now.release.phase)&&c.releaseEnabled)await pollReleases(c,token,run,signal,async()=>{},ids);
   else if(['failed','rejected','awaiting-approval'].includes(now.status)||now.release?.phase==='deployed'||now.release?.phase==='failed'||now.status==='completed'&&!c.releaseEnabled)break;
   await new Promise(resolve=>setTimeout(resolve,20000));
  }
 }finally{await connection.client.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const mcpUrl=process.env.LAB_MCP_URL,token=process.env.AI_AGENT_LAB_MCP_TOKEN;
 if(!mcpUrl||!/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/mcp$/.test(mcpUrl)||!token||token.length<24)throw Error('Configure LAB_MCP_URL and LAB_MCP_TOKEN secrets first.');
 const stateDir=path.resolve('cloud-state');await mkdir(stateDir,{recursive:true,mode:0o700});
 const locate=async name=>{const r=await command('/usr/bin/which',[name]);if(r.code)throw Error('Missing required cloud binary.');return r.stdout.trim();};
 const policyResponse=await fetch(new URL('/runner/cloud-policy',mcpUrl),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!policyResponse.ok)throw Error('Cloud policy unavailable.');const policy=await policyResponse.json();if(!policy.enabled)throw Error('Cloud worker is disabled in Lab settings.');
 const config={mcpUrl,stateDir,workerName:'github-cloud-worker',repoPath:path.join(stateDir,'writer-studio','repository'),ghPath:await locate('gh'),codexPath:await locate('codex'),releaseEnabled:policy.publishEnabled===true};
 // Authentication uses stdin, then remove the key before any repo script/model runs.
 const key=process.env.OPENAI_API_KEY;if(!key)throw Error('Missing cloud OPENAI_API_KEY secret.');
 const auth=await command(config.codexPath,['login','--with-api-key'],{input:key+'\n',timeout:30000});delete process.env.OPENAI_API_KEY;if(auth.code)throw Error('Cloud Codex authentication failed.');
 const git=await command('git',['config','--global','credential.helper','!'+config.ghPath+' auth git-credential']);if(git.code)throw Error('Cloud Git credential setup failed.');
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 try{await cloudCycle(config,token,{signal:controller.signal});}catch{console.error('Cloud worker stopped; inspect Lab and retained artifact. No automatic model retry.');process.exitCode=1;}
}
