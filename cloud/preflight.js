import path from 'node:path';

// Read-only checks before claiming work or creating a model run. Never print bodies/keys.
export async function cloudPreflight(env,{fetcher=fetch,log=console.log}={}){
 const {LAB_MCP_URL:url,AI_AGENT_LAB_MCP_TOKEN:lab,GH_TOKEN:github,OPENAI_API_KEY:openai}=env;
 if(!url||!/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/mcp$/.test(url)||!lab||!github||!openai)throw Error('Missing or invalid cloud secrets/URL.');
 const failures=[];
 async function check(label,url,token,json=false){
  try{const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/json','User-Agent':'ai-agent-lab'}});
   if(!r.ok){failures.push(label+' HTTP '+r.status);await r.body?.cancel();return null;}
   log('PASS '+label);if(json)return await r.json();await r.body?.cancel();return true;
  }catch{failures.push(label+' connection/response failed');return null;}
 }
 const manifest=await check('Lab MCP credential',new URL('/runner/projects',url).href,lab,true);
 const projects=manifest?.projects?.filter(p=>p.enabled&&p.runnerEnabled)||[];
 if(manifest&&!projects.length)failures.push('No enabled runner project.');
 for(const p of projects){
  if(!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p.repository)||p.repository.includes('..')){failures.push('Invalid project repository.');continue;}
  const root='https://api.github.com/repos/'+p.repository,ref=encodeURIComponent(p.branch||'main');
  for(const [permission,endpoint] of [['Contents: Read','/commits/'+ref],['Pull requests: Read','/pulls?per_page=1'],['Actions: Read','/actions/runs?per_page=1'],['Checks: Read','/commits/'+ref+'/check-runs?per_page=1'],['Commit statuses: Read','/commits/'+ref+'/status'],['Deployments: Read','/deployments?per_page=1']])await check(p.repository+' '+permission,root+endpoint,github);
 }
 await check('OpenAI API authentication (no model call)','https://api.openai.com/v1/models',openai);
 if(failures.length)throw Error('Cloud readiness failed: '+failures.join('; ')+'. No work claimed or model called.');
 log('Read-only readiness passed; write/merge capability still depends on token permissions and branch rules.');
 return {projects:projects.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 try{await cloudPreflight(process.env);}catch(e){console.error(e.message);process.exitCode=1;}
}
