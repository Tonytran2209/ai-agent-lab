// One global queue snapshot per monitor cycle, then project-local claim checks.
export async function readMonitorQueues(config,token,signal,fetcher=fetch){
 const read=async name=>{if(signal?.aborted)throw signal.reason;const res=await fetcher(new URL('/runner/'+name,config.mcpUrl),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(res.status===404)return [];if(!res.ok)throw Error('Monitor queue HTTP '+res.status);return (await res.json()).requests;};
 const results=await Promise.allSettled([read('verifications'),read('releases')]);
 if(results.every(r=>r.status==='rejected'))throw results[0].reason;
 return {verifications:results[0].status==='fulfilled'?results[0].value:[],releases:results[1].status==='fulfilled'?results[1].value:[],failed:results.some(r=>r.status==='rejected')};
}
export function runnerPollDelay(config,{active=false,failures=0}={}){
 const base=Math.min(60000,Math.max(5000,Number(config.pollIntervalMs)||15000));
 return failures?Math.min(120000,base*2**Math.min(failures,3)):active?base:Math.max(base,60000);
}
