import { githubClient, publishStep } from './release.js';
export async function pollVerifications(config,token,run,signal,onPullRequest=async()=>{}) {
  const endpoint=new URL('/runner/verifications',config.mcpUrl);
  const request=async(suffix='',body)=>{
    const res=await fetch(endpoint.href+suffix,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    if(res.status===404&&!suffix)return {requests:[]};
    if(!res.ok)throw new Error('Verification API: '+res.status);return res.json();
  };
  const {requests}=await request();
  for(const row of [...requests].reverse()){
    if(signal?.aborted)return;
    let claim;try{claim=await request('/'+row.id+'/claim',{});}catch{continue;}
    let update;
    try{
      const env={...process.env};delete env.AI_AGENT_LAB_MCP_TOKEN;delete env.MCP_TOKEN;
      const r=claim.request;
      update=await publishStep({request:{...r,release:{...r.verification,authorizedAt:r.verification.phaseStartedAt||r.verification.queuedAt,updatedAt:r.verification.at||r.verification.queuedAt}},purpose:'verification',config,run,signal,api:githubClient(run,config.ghPath||'/opt/homebrew/bin/gh',env,signal)});
      if(update.prUrl)await onPullRequest(update.prUrl);
    }catch(e){update={phase:'failed',note:String(e.message).slice(0,2000)};}
    await request('/'+row.id+'/report',{verificationToken:claim.verificationToken,update});return;
  }
}
